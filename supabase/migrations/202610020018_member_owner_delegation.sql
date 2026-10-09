-- Prepare only: applying this migration does not promote any existing account.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.bank_members ADD COLUMN role_version bigint NOT NULL DEFAULT 0 CHECK(role_version>=0);

-- All membership writers share the space lock, including old invitation/join
-- clients. A stale change cannot remove the last enabled administrator.
CREATE FUNCTION public.bank_member_change_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE space uuid;
BEGIN
 IF TG_OP='INSERT' THEN space=NEW.space_id; ELSE space=OLD.space_id; END IF;
 PERFORM 1 FROM public.bank_spaces WHERE id=space FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.email IS DISTINCT FROM OLD.email) THEN
  RAISE EXCEPTION '회원 식별정보는 역할 변경으로 바꿀 수 없습니다.';
 END IF;
 IF TG_OP<>'INSERT' AND OLD.enabled AND OLD.role='owner' THEN
  IF TG_OP='DELETE' OR NOT NEW.enabled OR NEW.role<>'owner' THEN
   IF NOT EXISTS(SELECT 1 FROM public.bank_members WHERE space_id=space AND enabled AND role='owner' AND email<>OLD.email) THEN
    RAISE EXCEPTION '마지막 관리자는 권한을 낮추거나 이용을 중지·삭제할 수 없습니다.' USING errcode='PT409';
   END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='INSERT' THEN NEW.role_version=0;
 ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.enabled IS DISTINCT FROM OLD.enabled OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
  NEW.role_version=OLD.role_version+1;
 ELSE NEW.role_version=OLD.role_version;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_member_change_guard BEFORE INSERT OR UPDATE OR DELETE ON public.bank_members
FOR EACH ROW EXECUTE FUNCTION public.bank_member_change_guard();
REVOKE EXECUTE ON FUNCTION public.bank_member_change_guard() FROM public,anon,authenticated;

CREATE FUNCTION public.bank_change_member_role(s uuid,email_address text,new_role text,expected_version bigint,confirmation_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.bank_members; normalized text; actor_email text;
BEGIN
 PERFORM 1 FROM public.bank_spaces WHERE id=s FOR UPDATE;
 -- Recheck after acquiring the lock: a concurrently demoted actor cannot grant.
 IF NOT public.bank_member(s,true) THEN RAISE insufficient_privilege; END IF;
 normalized=lower(trim(email_address));
 IF normalized IS NULL OR normalized='' OR confirmation_email IS NULL
  OR lower(trim(confirmation_email)) IS DISTINCT FROM normalized
  OR new_role IS NULL OR new_role NOT IN ('owner','reviewer','teacher')
  OR expected_version IS NULL OR expected_version<0 THEN
  RAISE EXCEPTION '대상 이메일·역할·확인 정보를 확인하세요.';
 END IF;
 SELECT * INTO target FROM public.bank_members WHERE space_id=s AND email=normalized FOR UPDATE;
 IF NOT FOUND OR target.role_version<>expected_version THEN
  RAISE EXCEPTION '회원 정보가 변경되었습니다. 새로고침 후 다시 확인하세요.' USING errcode='PT409';
 END IF;
 IF new_role='owner' AND (NOT target.enabled OR target.user_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.users WHERE id=target.user_id AND lower(email)=target.email AND email_confirmed_at IS NOT NULL
 )) THEN RAISE EXCEPTION '관리자는 이용 중이며 Google 로그인을 완료한 회원만 지정할 수 있습니다.'; END IF;
 IF target.role=new_role THEN RETURN jsonb_build_object('email',normalized,'role',target.role,'roleVersion',target.role_version); END IF;
 UPDATE public.bank_members SET role=new_role WHERE space_id=s AND email=normalized;
 SELECT email INTO actor_email FROM auth.users WHERE id=auth.uid();
 INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target)
 VALUES(s,auth.uid(),actor_email,'member_role_change',jsonb_build_object(
  'email',normalized,'previousRole',target.role,'newRole',new_role,'previousVersion',target.role_version,
  'newVersion',target.role_version+1,'confirmedEmail',normalized)::text);
 RETURN jsonb_build_object('email',normalized,'role',new_role,'roleVersion',target.role_version+1);
END $$;
REVOKE EXECUTE ON FUNCTION public.bank_change_member_role(uuid,text,text,bigint,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bank_change_member_role(uuid,text,text,bigint,text) TO authenticated;

-- Old three-argument callers remain limited to non-administrator role changes.
CREATE OR REPLACE FUNCTION public.bank_set_role(s uuid,email_address text,new_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.bank_members;
BEGIN
 PERFORM 1 FROM public.bank_spaces WHERE id=s FOR UPDATE;
 IF NOT public.bank_member(s,true) OR new_role IS NULL OR new_role NOT IN ('reviewer','teacher') THEN RAISE insufficient_privilege; END IF;
 SELECT * INTO target FROM public.bank_members WHERE space_id=s AND email=lower(trim(email_address)) FOR UPDATE;
 IF NOT FOUND OR target.role='owner' THEN RAISE EXCEPTION '변경 가능한 회원이 없습니다.'; END IF;
 PERFORM public.bank_change_member_role(s,target.email,new_role,target.role_version,target.email);
END $$;

-- Serialize the existing access toggle with promotion; it cannot suspend an
-- account which became an administrator after an old UI loaded its member row.
CREATE OR REPLACE FUNCTION public.bank_invite(s uuid,email_address text,enabled_value boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE normalized text;
BEGIN
 PERFORM 1 FROM public.bank_spaces WHERE id=s FOR UPDATE;
 IF NOT public.bank_member(s,true) THEN RAISE insufficient_privilege; END IF;
 normalized=lower(trim(email_address));
 IF normalized IS NULL OR normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR enabled_value IS NULL THEN RAISE EXCEPTION '이메일·이용 상태를 확인하세요.'; END IF;
 IF EXISTS(SELECT 1 FROM public.bank_members WHERE space_id=s AND email=normalized AND role='owner') THEN RAISE EXCEPTION '관리자는 먼저 역할 변경 화면에서 권한을 조정하세요.'; END IF;
 INSERT INTO public.bank_members(space_id,email,role,enabled) VALUES(s,normalized,'teacher',enabled_value)
 ON CONFLICT(space_id,email) DO UPDATE SET enabled=excluded.enabled;
 INSERT INTO public.bank_audit(space_id,actor_id,actor_email,action,target)
 VALUES(s,auth.uid(),(SELECT email FROM auth.users WHERE id=auth.uid()),CASE WHEN enabled_value THEN 'invite' ELSE 'revoke' END,normalized);
END $$;
COMMIT;
