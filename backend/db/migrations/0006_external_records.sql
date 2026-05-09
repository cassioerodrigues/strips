-- Migration 0006: external_records
-- Stores matched/suggested records from FamilySearch and other external sources (GEDCOM hint system).

create table external_records (
  id           uuid primary key default gen_random_uuid(),
  tree_id      uuid not null references trees(id) on delete cascade,
  person_id    uuid references persons(id) on delete set null,  -- vínculo opcional
  source       text not null,                                    -- 'familysearch' | 'archivio_treviso' | ...
  source_id    text,                                             -- id no sistema externo
  source_url   text,
  title        text,
  subtitle     text,
  confidence   smallint check (confidence between 0 and 100),
  status       record_status_t default 'suggested',
  payload      jsonb,                                            -- snapshot do registro original
  created_at   timestamptz default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references profiles(id)
);

create index external_records_person_idx on external_records(person_id);
create index external_records_tree_idx   on external_records(tree_id, status);
