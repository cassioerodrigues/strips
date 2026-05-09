-- Migration 0002: profiles, trees, tree_members
-- Creates user profile table (mirrors auth.users), family trees, and tree membership/collaboration tables.

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  locale       text default 'pt-BR',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table trees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id) on delete restrict,
  name        text not null,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index trees_owner_idx on trees(owner_id);

create table tree_members (
  tree_id    uuid not null references trees(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       tree_role_t not null,
  invited_by uuid references profiles(id),
  joined_at  timestamptz default now(),
  primary key (tree_id, user_id)
);

create index tree_members_user_idx on tree_members(user_id);
