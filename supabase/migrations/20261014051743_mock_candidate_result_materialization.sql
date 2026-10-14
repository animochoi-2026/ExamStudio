begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.bank_mock_candidates(s uuid, current_exam uuid, schools jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare data jsonb;used jsonb;filtered jsonb;begin
 used=public.bank_mock_usage(s,current_exam);
 if schools is null then data=bank_ops.bank_mock_recommendation_snapshot(s,'{}');else data=bank_ops.bank_mock_snapshot(s,schools,'{}');end if;
 -- Build the filtered array in its own statement: do not carry the full
 -- snapshot as an outer expression parameter through every original-id lookup.
 if jsonb_array_length(used)=0 then
  return data||jsonb_build_object('excludeIds','[]'::jsonb,'exclusions',used);
 end if;
 with candidates as materialized(
  select c,bank_ops.original_id(s,(c->>'question_id')::uuid)::text k
  from jsonb_array_elements(data->'candidates') c
 )
 select coalesce(jsonb_agg(c),'[]') into filtered from candidates
 where k not in(select u->>'originalId' from jsonb_array_elements(used) u);
 data=jsonb_set(data,'{candidates}',filtered);
 return data||jsonb_build_object('excludeIds',(select coalesce(jsonb_agg(distinct u->>'questionId'),'[]') from jsonb_array_elements(used) u),'exclusions',used);
end $function$;
commit;
