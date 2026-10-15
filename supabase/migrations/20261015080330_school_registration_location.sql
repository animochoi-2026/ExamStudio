-- Private service-only completion of location lookup after a verified upload.
-- Supabase service_role bypasses RLS, but still requires explicit SQL grants.
grant usage on schema bank_query to service_role;
grant execute on function bank_query.school_key(jsonb) to service_role;
grant select on public.bank_catalog,public.bank_revisions to service_role;
grant select,update on public.bank_school_regions to service_role;
create function public.bank_school_region_registration(revision uuid,actor uuid,expected integer default null,value jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.bank_catalog;r public.bank_school_regions;k text;
begin
 select bc.* into c from public.bank_catalog bc join public.bank_revisions br on br.id=bc.revision_id
 where bc.revision_id=revision and br.committed and br.actor_id=actor;
 if not found then raise insufficient_privilege;end if;
 k:=bank_query.school_key(c.metadata);
 select * into r from public.bank_school_regions where space_id=c.space_id and school_key=k for update;
 if not found then return jsonb_build_object('ignored',true);end if;
 if value is null then
  if r.checked_at is not null then return jsonb_build_object('reused',true);end if;
  if r.lookup_until>now() then return jsonb_build_object('busy',true);end if;
  update public.bank_school_regions set lookup_until=now()+interval '1 minute' where space_id=c.space_id and school_key=k;
  return jsonb_build_object('claimed',true,'school',to_jsonb(r));
 end if;
 if r.version<>expected or r.checked_at is not null then return jsonb_build_object('superseded',true);end if;
 if value->>'status' not in('verified','unverified','ambiguous','failed') or value->>'status' is null then raise check_violation;end if;
 update public.bank_school_regions set province=coalesce(value->>'province',''),district=coalesce(value->>'district',''),address=coalesce(value->>'address',''),place_id=value->>'place_id',status=value->>'status',source='google_places',checked_at=now(),updated_at=now(),version=version+1,candidates=coalesce(value->'candidates','[]'::jsonb),lookup_until=null
 where space_id=c.space_id and school_key=k;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.bank_school_region_registration(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.bank_school_region_registration(uuid,uuid,integer,jsonb) to service_role;
