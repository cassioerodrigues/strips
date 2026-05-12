-- Migration 0011: lookup_user_by_email (Issue #13).
-- Convidar um membro por email exige resolver email → user_id, mas `auth.users`
-- não é acessível ao role `authenticated`. Criamos uma função SECURITY DEFINER
-- restrita: somente o owner da árvore pode chamá-la, prevenindo enumeração de
-- emails por terceiros.

create or replace function public.lookup_user_by_email(
  p_tree_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  -- Só o owner da árvore pode resolver emails. `public.tree_role` é
  -- security-definer e devolve o role do auth.uid() atual.
  if public.tree_role(p_tree_id) is distinct from 'owner'::public.tree_role_t then
    raise exception 'Only the tree owner can look up users by email'
      using errcode = '42501';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.lookup_user_by_email(uuid, text) from public;
grant execute on function public.lookup_user_by_email(uuid, text) to authenticated;
