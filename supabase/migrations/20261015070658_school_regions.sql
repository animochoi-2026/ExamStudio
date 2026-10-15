-- Separate location registry. Existing catalog names, school keys and links are untouched.
create table public.bank_school_regions(
 space_id uuid not null references public.bank_spaces(id),
 school_key text not null,
 id uuid not null default gen_random_uuid(),
 name text not null,
 province text not null default '',district text not null default '',address text not null default '',
 place_id text, status text not null default 'unverified' check(status in('unverified','verified','ambiguous','failed')),
 source text not null default '',checked_at timestamptz,updated_at timestamptz not null default now(),
 version integer not null default 1, candidates jsonb not null default '[]',lookup_until timestamptz,
 primary key(space_id,school_key),unique(id),
 check(length(school_key)<=500 and length(name) between 1 and 200),
 check(length(province)<=100 and length(district)<=100 and length(address)<=1000),
 check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)<=10)
);
alter table public.bank_school_regions enable row level security;
create policy school_regions_read on public.bank_school_regions for select to authenticated using(public.bank_member(space_id) and exists(select 1 from public.bank_catalog c where c.space_id=bank_school_regions.space_id and coalesce(nullif(c.metadata#>>'{source,schoolId}',''),coalesce(c.metadata#>>'{source,region}','')||'|'||trim(coalesce(c.metadata#>>'{source,school}','')))=bank_school_regions.school_key));
revoke all on public.bank_school_regions from anon,authenticated;
grant select on public.bank_school_regions to authenticated;

create function public.bank_school_regions_sync(s uuid) returns setof public.bank_school_regions
language plpgsql security definer set search_path='' as $$
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 insert into public.bank_school_regions(space_id,school_key,name)
 select s,bank_query.school_key(c.metadata),min(trim(c.metadata#>>'{source,school}'))
 from bank_query.latest(s) c where nullif(trim(c.metadata#>>'{source,school}'),'') is not null
 group by bank_query.school_key(c.metadata) on conflict(space_id,school_key) do nothing;
 return query select r.* from public.bank_school_regions r where r.space_id=s order by r.name,r.school_key;
end $$;

create function public.bank_school_region_save(s uuid,k text,expected integer,value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.bank_school_regions;
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 if value->>'status' not in('unverified','verified','ambiguous','failed') or value->>'source' not in('manual','google_places','') then raise exception '지역 확인 정보를 확인하세요';end if;
 if value->>'status'='verified' and (coalesce(value->>'province','')='' or coalesce(value->>'district','')='' or coalesce(value->>'address','')='') then raise exception '확인한 시도·시군구·주소가 필요합니다';end if;
 update public.bank_school_regions r set province=coalesce(value->>'province',''),district=coalesce(value->>'district',''),address=coalesce(value->>'address',''),place_id=nullif(value->>'place_id',''),status=value->>'status',source=value->>'source',checked_at=now(),updated_at=now(),lookup_until=null,version=r.version+1,candidates=coalesce(value->'candidates','[]')
 where r.space_id=s and r.school_key=k and r.version=expected returning * into result;
 if not found then raise exception '학교 정보가 변경되었습니다. 새로 조회하세요' using errcode='PT409';end if;
 return to_jsonb(result);
end $$;
revoke all on function public.bank_school_regions_sync(uuid),public.bank_school_region_save(uuid,text,integer,jsonb) from public,anon;
grant execute on function public.bank_school_regions_sync(uuid),public.bank_school_region_save(uuid,text,integer,jsonb) to authenticated;

-- Only one external request per school. A crashed request can be retried after one minute.
create function public.bank_school_region_claim(s uuid,k text,expected integer,force_lookup boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.bank_school_regions;
begin
 if not public.bank_member(s,true) then raise insufficient_privilege;end if;
 select * into r from public.bank_school_regions where space_id=s and school_key=k for update;
 if not found then raise exception '등록된 학교가 아닙니다';end if;
 if r.version<>expected then raise exception '학교 정보가 변경되었습니다. 새로 조회하세요' using errcode='PT409';end if;
 if r.lookup_until>now() then return jsonb_build_object('busy',true);end if;
 if r.checked_at is not null and not force_lookup then return jsonb_build_object('reused',true,'school',to_jsonb(r));end if;
 update public.bank_school_regions set lookup_until=now()+interval '1 minute' where space_id=s and school_key=k;
 return jsonb_build_object('claimed',true);
end $$;
revoke all on function public.bank_school_region_claim(uuid,text,integer,boolean) from public,anon;
grant execute on function public.bank_school_region_claim(uuid,text,integer,boolean) to authenticated;

-- New registrations receive a pending region record without altering source identity.
create function bank_query.register_school_region() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if nullif(trim(new.metadata#>>'{source,school}'),'') is not null then
  insert into public.bank_school_regions(space_id,school_key,name)
  values(new.space_id,bank_query.school_key(new.metadata),trim(new.metadata#>>'{source,school}')) on conflict(space_id,school_key) do nothing;
 end if;return new;
end $$;
revoke all on function bank_query.register_school_region() from public,anon,authenticated;
create trigger school_region_registered after insert or update of metadata on public.bank_catalog for each row execute function bank_query.register_school_region();
