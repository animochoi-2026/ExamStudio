-- Explicit, revision-bound acknowledgements. Original metadata and full-review state are untouched.
create or replace function public.bank_upload_review_save(r uuid,reasons jsonb,evidence jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid;v public.bank_revisions;old jsonb;m jsonb;snapshot jsonb;prior jsonb;ack jsonb;merged jsonb;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select q.space_id into s from public.bank_questions q join public.bank_revisions x on x.question_id=q.id where x.id=r and not q.archived;
 if s is null or not public.bank_member(s) or not public.bank_read_revision(r) then raise insufficient_privilege;end if;
 if jsonb_typeof(reasons) is distinct from 'array' or jsonb_array_length(reasons) not between 1 and 100
 or exists(select 1 from jsonb_array_elements(reasons) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 2000)
 or jsonb_typeof(evidence) is distinct from 'object' or length(evidence::text)>200000 then raise exception '확인 사유 입력 형식 오류';end if;
 select * into v from public.bank_revisions where id=r for update;
 if not v.committed or v.visibility not in ('shared_pending','approved') then raise exception '공동 문항만 확인할 수 있습니다';end if;
 if v.review_version is distinct from expected then raise sqlstate 'PT409' using message='검수 정보가 변경되었습니다. 최신 내용을 다시 확인하세요';end if;
 select confirmed,metadata into old,m from public.bank_catalog where revision_id=r for update;
 if old is null or not bank_grade.matches(m#>>'{source,grade}') then raise insufficient_privilege;end if;
 snapshot:=jsonb_build_object('reviews',coalesce(m->'reviews','{}'::jsonb),'management',coalesce(m->'management','{}'::jsonb));
 if evidence is distinct from snapshot then raise sqlstate 'PT409' using message='확인 사유가 변경되었습니다. 최신 내용을 다시 확인하세요';end if;
 prior:=old->'uploadReview';
 select coalesce(jsonb_agg(x order by x),'[]'::jsonb) into merged from (
 select distinct value x from jsonb_array_elements(reasons || case when prior->>'revisionId'=r::text and prior->'evidence'=snapshot then coalesce(prior->'reasons','[]'::jsonb) else '[]'::jsonb end)
 ) a;
 ack:=jsonb_build_object('revisionId',r,'evidence',snapshot,'reasons',merged,'actorId',auth.uid(),'at',now());
 update public.bank_catalog set confirmed=confirmed||jsonb_build_object('uploadReview',ack) where revision_id=r;
 update public.bank_revisions set review_version=review_version+1 where id=r;
 insert into public.bank_audit(space_id,actor_id,actor_email,action,target) values(s,auth.uid(),(select email from auth.users where id=auth.uid()),'upload_review_acknowledge',jsonb_build_object('revision',r,'before',prior,'after',ack)::text);
 return jsonb_build_object('version',v.review_version+1,'review',ack);
end $$;
revoke all on function public.bank_upload_review_save(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function public.bank_upload_review_save(uuid,jsonb,jsonb,integer) to authenticated;
