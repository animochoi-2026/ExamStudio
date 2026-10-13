-- Preserve the existing membership and row visibility contract. PostgreSQL may
-- evaluate OR operands in any order; a folder-owner lookup must not run the
-- recursive all-files visibility scan before taking the owner branch.
-- CREATE OR REPLACE retains the existing owner, grants and SECURITY DEFINER.
create or replace function public.bank_read_entry(f uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.bank_entries e where e.id=f and
  case
   when public.bank_member(e.space_id) is not true then false
   when e.owner_id=auth.uid() then true
   when e.kind='folder' then case when e.id=e.space_id then true else public.bank_read_folder(e.id) end
   when e.verified then exists (
    select 1 from public.bank_revision_files rf
    where rf.file_id=e.id and public.bank_read_revision(rf.revision_id)
   )
   else false
  end
 );
$$;
