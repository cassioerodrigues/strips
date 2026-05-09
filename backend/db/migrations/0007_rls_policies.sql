-- Migration 0007: Row Level Security policies
-- Enables RLS on all domain tables, defines helper functions, and creates per-table access policies.

alter table trees            enable row level security;
alter table tree_members     enable row level security;
alter table persons          enable row level security;
alter table person_parents   enable row level security;
alter table unions           enable row level security;
alter table events           enable row level security;
alter table media            enable row level security;
alter table person_media     enable row level security;
alter table event_media      enable row level security;
alter table union_media      enable row level security;
alter table external_records enable row level security;
alter table profiles         enable row level security;

-- Helper: usuário é membro da árvore?
create or replace function is_tree_member(t uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tree_members
    where tree_id = t and user_id = auth.uid()
  );
$$;

create or replace function tree_role(t uuid)
returns tree_role_t language sql stable security definer as $$
  select role from tree_members
  where tree_id = t and user_id = auth.uid();
$$;

-- persons
create policy persons_select on persons
  for select using (is_tree_member(tree_id));

create policy persons_write on persons
  for all using (tree_role(tree_id) in ('owner','editor'))
  with check (tree_role(tree_id) in ('owner','editor'));

-- person_parents (tree_id derived via child_id → persons)
create policy person_parents_select on person_parents
  for select using (
    is_tree_member((select tree_id from persons where id = child_id))
  );

create policy person_parents_write on person_parents
  for all using (
    tree_role((select tree_id from persons where id = child_id)) in ('owner','editor')
  )
  with check (
    tree_role((select tree_id from persons where id = child_id)) in ('owner','editor')
  );

-- unions
create policy unions_select on unions
  for select using (is_tree_member(tree_id));

create policy unions_write on unions
  for all using (tree_role(tree_id) in ('owner','editor'))
  with check (tree_role(tree_id) in ('owner','editor'));

-- events
create policy events_select on events
  for select using (is_tree_member(tree_id));

create policy events_write on events
  for all using (tree_role(tree_id) in ('owner','editor'))
  with check (tree_role(tree_id) in ('owner','editor'));

-- media
create policy media_select on media
  for select using (is_tree_member(tree_id));

create policy media_write on media
  for all using (tree_role(tree_id) in ('owner','editor'))
  with check (tree_role(tree_id) in ('owner','editor'));

-- person_media (tree_id derived via person_id → persons)
create policy person_media_select on person_media
  for select using (
    is_tree_member((select tree_id from persons where id = person_id))
  );

create policy person_media_write on person_media
  for all using (
    tree_role((select tree_id from persons where id = person_id)) in ('owner','editor')
  )
  with check (
    tree_role((select tree_id from persons where id = person_id)) in ('owner','editor')
  );

-- event_media (tree_id derived via event_id → events)
create policy event_media_select on event_media
  for select using (
    is_tree_member((select tree_id from events where id = event_id))
  );

create policy event_media_write on event_media
  for all using (
    tree_role((select tree_id from events where id = event_id)) in ('owner','editor')
  )
  with check (
    tree_role((select tree_id from events where id = event_id)) in ('owner','editor')
  );

-- union_media (tree_id derived via union_id → unions)
create policy union_media_select on union_media
  for select using (
    is_tree_member((select tree_id from unions where id = union_id))
  );

create policy union_media_write on union_media
  for all using (
    tree_role((select tree_id from unions where id = union_id)) in ('owner','editor')
  )
  with check (
    tree_role((select tree_id from unions where id = union_id)) in ('owner','editor')
  );

-- external_records
create policy external_records_select on external_records
  for select using (is_tree_member(tree_id));

create policy external_records_write on external_records
  for all using (tree_role(tree_id) in ('owner','editor'))
  with check (tree_role(tree_id) in ('owner','editor'));

-- trees: members can read; only owner can modify
create policy trees_select on trees
  for select using (is_tree_member(id));

create policy trees_write on trees
  for all using (tree_role(id) = 'owner')
  with check (tree_role(id) = 'owner');

-- tree_members: members can see membership list; only owner can add/remove
create policy tree_members_select on tree_members
  for select using (is_tree_member(tree_id));

create policy tree_members_insert on tree_members
  for insert with check (tree_role(tree_id) = 'owner');

create policy tree_members_delete on tree_members
  for delete using (tree_role(tree_id) = 'owner');

create policy tree_members_update on tree_members
  for update
  using (tree_role(tree_id) = 'owner')
  with check (tree_role(tree_id) = 'owner');

-- profiles: each user reads their own + profiles of co-members in their trees
create policy profiles_select on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from tree_members tm1
      join tree_members tm2 on tm1.tree_id = tm2.tree_id
      where tm1.user_id = auth.uid()
        and tm2.user_id = profiles.id
    )
  );

create policy profiles_write on profiles
  for all using (id = auth.uid())
  with check (id = auth.uid());
