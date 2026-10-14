begin;
create extension if not exists pg_net with schema extensions;
-- The token stays in the private schema and is never sent to browsers or logs.
select cron.schedule('examstudio-paper-pdf-cleanup','* * * * *',$job$
 select net.http_post(
  url:='https://bjxxqdbftefughjkcrqj.supabase.co/functions/v1/bank-paper-pdf',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('operation','cleanup','secret',(select secret from bank_ops.pdf_cleanup_config where singleton)),
  timeout_milliseconds:=60000
 );
$job$);
commit;
