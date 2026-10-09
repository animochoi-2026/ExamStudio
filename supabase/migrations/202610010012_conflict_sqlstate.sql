-- Incident hotfix: preserve conflict checks and privileges; stop PostgREST retry classification.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.bank_guard_revision_commit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare heads uuid[];begin
if not new.committed or old.committed then return new;end if;
perform pg_advisory_xact_lock(hashtextextended(new.question_id::text,0));
select array_agg(r.id) into heads from public.bank_revisions r where r.question_id=new.question_id and r.committed and r.id<>new.id and not exists(select 1 from public.bank_revisions child where child.parent_id=r.id and child.committed);
if coalesce(cardinality(heads),0)>1 or cardinality(heads)=1 and new.parent_id is distinct from heads[1] or coalesce(cardinality(heads),0)=0 and new.parent_id is not null then raise exception '수정 충돌: 기준 버전 이후 새 변경이 있습니다. 최신본을 불러와 비교하세요.' using errcode='PT409';end if;return new;end $function$
;
COMMIT;
