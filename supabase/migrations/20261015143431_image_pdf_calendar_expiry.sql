begin;
-- Match the existing paper_lifetime policy: six calendar months in Asia/Seoul.
-- Do not rewrite parent creation dates, existing slot expiries, or user documents.
do $migration$
declare definition text; revised text;
begin
 select pg_get_functiondef('public.bank_image_pdf_service(uuid,jsonb)'::regprocedure) into definition;
 revised:=replace(definition,
  'e.created_at+interval ''6 months''',
  '((e.created_at at time zone ''Asia/Seoul'')+interval ''6 months'') at time zone ''Asia/Seoul''');
 revised:=replace(revised,
  'least(now(),coalesce(nullif(shape->>''createdAt'','''')::timestamptz,now()))+interval ''6 months''',
  '((least(now(),coalesce(nullif(shape->>''createdAt'','''')::timestamptz,now())) at time zone ''Asia/Seoul'')+interval ''6 months'') at time zone ''Asia/Seoul''');
 if revised=definition or position('e.created_at+interval ''6 months''' in revised)>0 then
  raise exception 'Image PDF expiry function does not match the expected migration baseline';
 end if;
 execute revised;
end $migration$;
commit;
