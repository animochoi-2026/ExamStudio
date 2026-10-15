begin;
-- Preserve legacy read/expiry behavior, but remove all public generation paths.
alter function public.bank_native_pdf_service(uuid,jsonb) set schema bank_ops;
revoke all on function bank_ops.bank_native_pdf_service(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.bank_native_pdf_service(actor uuid,job jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(job->>'operation','') not in('read','missing','abort','gc','gc_done') then
  raise exception '네이티브 PDF 생성은 종료됐습니다. 웹 화면을 새로고침해 이미지 PDF로 생성하세요.' using errcode='PT410';
 end if;
 return bank_ops.bank_native_pdf_service(actor,job);
end $$;
revoke all on function public.bank_native_pdf_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bank_native_pdf_service(uuid,jsonb) to service_role;
commit;
