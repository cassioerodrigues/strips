-- Migration 0003: persons table
-- Creates the persons table. photo_media_id FK to media is deferred and added in 0005.

create table persons (
  id                uuid primary key default gen_random_uuid(),
  tree_id           uuid not null references trees(id) on delete cascade,

  -- nome
  first_name        text,
  middle_names      text,
  last_name         text,
  maiden_name       text,
  display_name      text,            -- cache opcional p/ exibição

  -- básicos
  sex               sex_t not null default 'U',
  is_living         boolean not null default true,

  -- nascimento (data parcial: ano sempre, mês/dia opcionais)
  birth_year        smallint,
  birth_month       smallint check (birth_month between 1 and 12),
  birth_day         smallint check (birth_day  between 1 and 31),
  birth_place       text,

  -- morte
  death_year        smallint,
  death_month       smallint check (death_month between 1 and 12),
  death_day         smallint check (death_day  between 1 and 31),
  death_place       text,
  death_cause       text,

  -- biografia & metadata
  occupation        text,
  bio               text,
  tags              text[]    default '{}',
  photo_media_id    uuid,            -- FK adicionada depois (deferred) p/ foto principal

  -- IDs externos
  family_search_id  text,            -- não obrigatório
  gedcom_id         text,            -- futuro import/export GEDCOM
  external_ids      jsonb default '{}'::jsonb,  -- bucket genérico p/ outras fontes

  created_by        uuid references profiles(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index persons_tree_idx           on persons(tree_id);
create index persons_familysearch_idx   on persons(family_search_id) where family_search_id is not null;
create index persons_last_first_idx     on persons(tree_id, last_name, first_name);
