-- Migration 0004: person_parents and unions
-- Creates filiation (with adoption support) and union/marriage tables with unique-pair-period index.

create table person_parents (
  child_id   uuid not null references persons(id) on delete cascade,
  parent_id  uuid not null references persons(id) on delete cascade,
  kind       parent_kind_t not null default 'biological',
  notes      text,
  created_at timestamptz default now(),
  primary key (child_id, parent_id),
  check (child_id <> parent_id)
);

create index person_parents_parent_idx on person_parents(parent_id);

create table unions (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,

  -- ordenação determinística dos parceiros para evitar duplicar (A,B) e (B,A)
  partner_a_id  uuid not null references persons(id) on delete cascade,
  partner_b_id  uuid not null references persons(id) on delete cascade,

  type          union_type_t   not null default 'marriage',
  status        union_status_t not null default 'ongoing',

  start_year    smallint,
  start_month   smallint,
  start_day     smallint,
  start_place   text,

  end_year      smallint,
  end_month     smallint,
  end_day       smallint,
  end_place     text,
  end_reason    text,

  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  check (partner_a_id <> partner_b_id),
  check (partner_a_id < partner_b_id)        -- canonical order (UUIDs comparáveis)
);

create unique index unions_unique_pair_period
  on unions(partner_a_id, partner_b_id, coalesce(start_year, 0));

create index unions_partner_a_idx on unions(partner_a_id);
create index unions_partner_b_idx on unions(partner_b_id);
