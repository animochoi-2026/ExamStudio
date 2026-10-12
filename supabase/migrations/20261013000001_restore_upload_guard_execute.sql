-- The global PostgREST pre-request hook is also invoked by the existing
-- service_role used inside bank-verify. Keep the hook and its checks enabled.
grant execute on function public.bank_security_request_guard() to service_role;
