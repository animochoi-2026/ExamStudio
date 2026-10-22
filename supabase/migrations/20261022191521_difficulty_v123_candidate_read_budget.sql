-- Bounded read-only RPC budget for the frozen 1266 candidate payload. No global or role change.
alter function public.bank_mock_candidates(uuid,uuid,jsonb) set statement_timeout='30s';
alter function public.bank_mock_auto_candidates(uuid,uuid,jsonb,jsonb,uuid[]) set statement_timeout='30s';
alter function public.bank_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) set statement_timeout='30s';
alter function public.bank_set_replacement_candidates(uuid,uuid,jsonb,uuid[],text,integer,text,uuid) set statement_timeout='30s';
notify pgrst,'reload schema';
