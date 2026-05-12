-- Migration 0010: fix search_path da handle_new_user (Issue #12 follow-up).
-- A função 0009 falhava quando invocada pelo gotrue (Supabase Auth) porque o
-- `SECURITY DEFINER` herda o search_path do caller, e o role do gotrue
-- (supabase_auth_admin) tem search_path sem `public`. Recriamos a função com
-- `set search_path = ''` (best practice de Supabase) e qualificamos todas as
-- referências de schema.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'locale', 'pt-BR')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger continua o mesmo; só a função foi recriada via `create or replace`.
