-- Migration 0013: subscription plans
-- Stores the plan assigned to each authenticated user.

create table subscription_plans (
  code               text primary key,
  name               text not null,
  collaborator_limit integer,
  created_at         timestamptz default now(),
  check (code in ('free', 'family', 'heritage')),
  check (collaborator_limit is null or collaborator_limit >= 0)
);

insert into subscription_plans(code, name, collaborator_limit) values
  ('free', 'Gratis', 0),
  ('family', 'Família', 8),
  ('heritage', 'Patrimônio', null)
on conflict (code) do update set
  name = excluded.name,
  collaborator_limit = excluded.collaborator_limit;

create table user_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  plan_code          text not null references subscription_plans(code),
  status             text not null default 'active',
  current_period_end timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  check (status in ('active', 'past_due', 'canceled'))
);

create unique index user_subscriptions_one_active_idx
  on user_subscriptions(user_id)
  where status = 'active';

create index user_subscriptions_user_idx on user_subscriptions(user_id);

alter table subscription_plans enable row level security;
alter table user_subscriptions enable row level security;

create policy subscription_plans_select on subscription_plans
  for select using (true);

create policy user_subscriptions_select on user_subscriptions
  for select using (user_id = auth.uid());
