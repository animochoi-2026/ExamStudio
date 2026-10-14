begin;
select cron.schedule('examstudio-native-pdf-cleanup','* * * * *',$job$
 select net.http_post(
  url:='https://bjxxqdbftefughjkcrqj.supabase.co/functions/v1/bank-native-pdf',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('job',jsonb_build_object('operation','cleanup','secret',(select secret from bank_ops.pdf_cleanup_config where singleton))),
  timeout_milliseconds:=60000
 );
$job$);
commit;
