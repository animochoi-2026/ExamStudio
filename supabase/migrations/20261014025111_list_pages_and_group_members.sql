-- UI composition codes differ from the rubric display bands. Match final numeric scores.
begin;
create function public.bank_question_page(s uuid,filters jsonb default '{}',start_at integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.bank_member(s) then raise insufficient_privilege;end if;
 if start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.';end if;
 return (with current_rows as materialized(select c.*,r.visibility,q.owner_email,bank_summary.row_difficulty(c.revision_id,c.metadata,c.confirmed) d from bank_query.latest(s) c join public.bank_revisions r on r.id=c.revision_id join public.bank_questions q on q.id=c.question_id),
 filtered as materialized(select c from current_rows c where
 (coalesce(filters->>'compositionBand','')='' or (filters->>'compositionBand'='killer' and (d->>'score')::numeric>=9) or (filters->>'compositionBand'<>'killer' and (case when d->>'score' is null then 'unknown' when (d->>'score')::numeric<=3 then 'low' when (d->>'score')::numeric<8 then 'middle' else 'high' end)=filters->>'compositionBand'))
 and(coalesce(filters->>'text','')='' or (metadata::text||content::text||confirmed::text) ilike '%'||(filters->>'text')||'%')
 and(coalesce(filters->>'school','')='' or metadata#>>'{source,school}'=filters->>'school')
 and(coalesce(filters->>'academicYear','')='' or metadata#>>'{source,academicYear}'=filters->>'academicYear')
 and(coalesce(filters->>'grade','')='' or metadata#>>'{source,grade}'=filters->>'grade')
 and(coalesce(filters->>'semester','')='' or metadata#>>'{source,semester}'=filters->>'semester')
 and(coalesce(filters->>'unit','')='' or exists(select 1 from bank_query.units u where u.id=bank_query.unit_id(metadata,confirmed) and (u.title=filters->>'unit' or u.id=filters->>'unit')))
 and public.bank_type_matches(metadata,confirmed,filters->>'type')
 and(coalesce(filters->>'owner','')='' or owner_email=filters->>'owner')
 and(coalesce(filters->>'status','')='' or visibility=filters->>'status')),
 page_rows as(select c from filtered order by (c).created_at desc,(c).revision_id desc limit 20 offset start_at)
 select jsonb_build_object('total',(select count(*) from filtered),'items',(select coalesce(jsonb_agg(bank_query.compact(b) order by (p.c).created_at desc,(p.c).revision_id desc),'[]') from page_rows p join public.bank_catalog b on b.revision_id=(p.c).revision_id)));
end $$;


-- Existing owner/admin visibility, with filtering and a fixed 20-row response.
create function public.bank_members_page(s uuid,filters jsonb default '{}',start_at integer default 0,target_group uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not bank_access.can_manage(s) then raise insufficient_privilege;end if;
 if start_at is null or start_at<0 or start_at>100000 then raise exception '페이지를 확인하세요.' using errcode='22023';end if;
 if target_group is not null and (not public.bank_member(s,true) or not exists(select 1 from public.bank_groups where space_id=s and id=target_group)) then raise insufficient_privilege;end if;
 return (with filtered as materialized(
 select m.email,m.user_id,m.role,m.enabled,m.role_version,coalesce(nullif(p.display_name,''),m.display_name) name,p.academy_name academy,m.group_id,g.name group_name
 from public.bank_members m left join public.bank_member_profiles p on p.user_id=m.user_id left join public.bank_groups g on g.id=m.group_id
 where m.space_id=s and bank_ops.manage_group(s,m.group_id) and (target_group is null or m.user_id is not null)
 and(coalesce(filters->>'text','')='' or strpos(lower(concat_ws(' ',p.display_name,m.display_name,p.academy_name,m.email)),lower(btrim(filters->>'text')))>0)
 and(coalesce(filters->>'group','')='' or (filters->>'group'='unassigned' and m.group_id is null) or m.group_id::text=filters->>'group')
 and(coalesce(filters->>'role','')='' or m.role=filters->>'role')
 and(coalesce(filters->>'enabled','')='' or m.enabled::text=filters->>'enabled')),
 counts as(select count(*) total from filtered),
 bounds as(select total,least(start_at/20*20,greatest(0,(total-1)/20*20))::integer pos from counts),
 page_rows as(select f.*,row_number() over(order by case when target_group is not null and group_id=target_group then 0 else 1 end,lower(coalesce(nullif(name,''),email)),email,user_id) ordering
 from filtered f order by case when target_group is not null and group_id=target_group then 0 else 1 end,lower(coalesce(nullif(name,''),email)),email,user_id limit 20 offset(select pos from bounds))
 select jsonb_build_object('total',bounds.total,'startAt',bounds.pos,'pageSize',20,'items',
 (select coalesce(jsonb_agg(jsonb_build_object('email',email,'userId',user_id,'role',role,'enabled',enabled,'roleVersion',role_version,'name',name,'academy',academy,'groupId',group_id,'groupName',group_name) order by ordering),'[]') from page_rows)) from bounds);
end $$;

-- A single transaction validates the whole change set before assigning anything.
create function public.bank_group_members_save(s uuid,g uuid,changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb;m public.bank_members;seen uuid[]='{}';u uuid;next_group uuid;n integer=0;
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 perform 1 from public.bank_spaces where id=s for update;
 if not public.bank_member(s,true) or not exists(select 1 from public.bank_groups where space_id=s and id=g) then raise insufficient_privilege;end if;
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>10000 then raise exception '그룹 변경 목록을 확인하세요.' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(changes) loop
  if jsonb_typeof(c->'selected') is distinct from 'boolean' or not(c?'expectedGroupId') then raise exception '그룹 변경 내용을 확인하세요.' using errcode='22023';end if;
  u=(c->>'userId')::uuid;
  if u is null or u=any(seen) then raise exception '중복되거나 잘못된 회원입니다.' using errcode='22023';end if;seen=array_append(seen,u);
  select * into m from public.bank_members where space_id=s and user_id=u for update;
  if not found then raise exception '회원 목록이 변경되었습니다. 다시 열어 주세요.' using errcode='PT409';end if;
  if m.group_id is distinct from (c->>'expectedGroupId')::uuid then raise exception '회원의 소속 그룹이 변경되었습니다. 다시 열어 확인해 주세요.' using errcode='PT409';end if;
  if (c->>'selected')::boolean then
   if m.group_id is not null and m.group_id<>g and coalesce(c->'confirmMove','false'::jsonb)<>'true'::jsonb then raise exception '현재 그룹에서 제외하고 새 그룹으로 이동할지 확인해 주세요.' using errcode='22023';end if;
  elsif m.group_id is distinct from g then raise exception '이 그룹에 속하지 않은 회원은 해제할 수 없습니다.' using errcode='PT409';
  end if;
 end loop;
 for c in select value from jsonb_array_elements(changes) loop
  u=(c->>'userId')::uuid;next_group=case when (c->>'selected')::boolean then g else null end;
  update public.bank_members set group_id=next_group where space_id=s and user_id=u and group_id is distinct from next_group;
  if found then
   n=n+1;insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'member_group_assign',jsonb_build_object('userId',u,'fromGroupId',c->'expectedGroupId','groupId',next_group)::text);
  end if;
 end loop;
 return jsonb_build_object('changed',n,'memberCount',(select count(*) from public.bank_members where space_id=s and group_id=g));
end $$;
revoke all on function public.bank_members_page(uuid,jsonb,integer,uuid),public.bank_group_members_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_members_page(uuid,jsonb,integer,uuid),public.bank_group_members_save(uuid,uuid,jsonb) to authenticated;
create function public.bank_question_sets_page(s uuid,revisions uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.bank_member(s) then raise insufficient_privilege; end if;
 if revisions is null or cardinality(revisions)>20 then raise exception '최대 20문항만 조회할 수 있습니다.' using errcode='22023';end if;
 select coalesce(jsonb_agg((to_jsonb(g)||case when jsonb_array_length(m.items)=cardinality(g.original_numbers) or g.owner_id=auth.uid() then '{}'::jsonb else '{"common":null,"member_output":null}'::jsonb end)||jsonb_build_object('members',m.items,'complete',jsonb_array_length(m.items)=cardinality(g.original_numbers) and not m.items @> '[{"ambiguous":true}]'::jsonb)),'[]') into result
 from public.bank_question_sets g cross join lateral (
  select coalesce(jsonb_agg(jsonb_build_object('questionId',c.question_id,'revisionId',c.revision_id,'originalNumber',n.num,'ambiguous',c.matches>1) order by n.ord),'[]') items
  from unnest(g.original_numbers) with ordinality n(num,ord)
  join lateral (
   select c.question_id,c.revision_id,count(*) over() as matches from public.bank_catalog c
   join public.bank_questions q on q.id=c.question_id join public.bank_revisions r on r.id=c.revision_id
   where c.space_id=s and c.metadata#>>'{source,documentId}'=g.source_document
    and c.metadata#>>'{source,originalNumber}'=n.num and r.committed and not q.archived
    and public.bank_read_revision(r.id)
    and coalesce(c.metadata#>>'{relations,originalQuestionId}','')='' and coalesce(c.metadata#>>'{relations,derivedFromQuestionId}','')=''
    and not exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed)
   order by c.created_at desc limit 1
  ) c on true
 ) m where g.space_id=s and exists(select 1 from public.bank_catalog requested where requested.revision_id=any(revisions) and requested.space_id=s and public.bank_read_revision(requested.revision_id) and requested.metadata#>>'{source,documentId}'=g.source_document and requested.metadata#>>'{source,originalNumber}'=any(g.original_numbers)) and (jsonb_array_length(m.items)>0 or g.owner_id=auth.uid());
 return result;
end $$;
revoke all on function public.bank_question_sets_page(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.bank_question_sets_page(uuid,uuid[]) to authenticated;
revoke all on function public.bank_question_page(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.bank_question_page(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
