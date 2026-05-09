-- Migration 0008: Supabase Storage bucket and access policies
-- Creates the stirps-media private bucket and mirrors RLS using tree_id extracted from the storage path.

insert into storage.buckets (id, name, public)
values ('stirps-media', 'stirps-media', false)
on conflict do nothing;

-- Members of a tree can read objects under tree_<uuid>/...
create policy storage_stirps_select on storage.objects
  for select using (
    bucket_id = 'stirps-media'
    and is_tree_member(
      (regexp_replace((storage.foldername(name))[1], '^tree_', ''))::uuid
    )
  );

-- Editors and owners can upload objects
create policy storage_stirps_insert on storage.objects
  for insert with check (
    bucket_id = 'stirps-media'
    and tree_role(
      (regexp_replace((storage.foldername(name))[1], '^tree_', ''))::uuid
    ) in ('owner','editor')
  );

-- Editors and owners can update objects
create policy storage_stirps_update on storage.objects
  for update using (
    bucket_id = 'stirps-media'
    and tree_role(
      (regexp_replace((storage.foldername(name))[1], '^tree_', ''))::uuid
    ) in ('owner','editor')
  );

-- Editors and owners can delete objects
create policy storage_stirps_delete on storage.objects
  for delete using (
    bucket_id = 'stirps-media'
    and tree_role(
      (regexp_replace((storage.foldername(name))[1], '^tree_', ''))::uuid
    ) in ('owner','editor')
  );
