-- No storage delete is scheduled: server papers contain JSON/layout, and downloads are browser-local.
-- Referenced bank previews, source documents, and templates must remain intact.
begin;
create extension if not exists pg_cron;
select cron.schedule('examstudio-paper-retention-six-months','* * * * *','select bank_ops.expire_papers();');
commit;
