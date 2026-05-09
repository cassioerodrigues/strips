-- Migration 0005: events, media, and join tables; also adds deferred FK persons.photo_media_id
-- Creates events (GEDCOM-style), media (Storage references), person_media, event_media, union_media,
-- and finalises the persons→media foreign key that could not be declared in 0003.

create table events (
  id           uuid primary key default gen_random_uuid(),
  tree_id      uuid not null references trees(id) on delete cascade,
  person_id    uuid references persons(id) on delete cascade,
  union_id     uuid references unions(id)  on delete cascade,
  type         event_type_t not null,
  custom_label text,                   -- usado quando type = 'custom'
  year         smallint,
  month        smallint,
  day          smallint,
  place        text,
  description  text,
  created_at   timestamptz default now(),
  check (person_id is not null or union_id is not null)
);

create index events_person_idx on events(person_id);
create index events_union_idx  on events(union_id);
create index events_tree_year  on events(tree_id, year);

create table media (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid not null references trees(id) on delete cascade,
  kind          media_kind_t not null,
  storage_path  text not null,         -- ex: "tree_<id>/persons/<pid>/foto-1.jpg"
  mime_type     text,
  size_bytes    bigint,
  title         text,
  description   text,
  taken_year    smallint,              -- data do conteúdo
  taken_month   smallint,
  taken_day     smallint,
  taken_place   text,
  uploaded_by   uuid references profiles(id),
  uploaded_at   timestamptz default now()
);

create index media_tree_idx on media(tree_id);

-- Vincular múltiplas pessoas a uma mesma mídia (foto de família)
create table person_media (
  person_id  uuid not null references persons(id) on delete cascade,
  media_id   uuid not null references media(id)   on delete cascade,
  is_primary boolean default false,
  primary key (person_id, media_id)
);
create index person_media_media_idx on person_media(media_id);

-- Mídia que documenta um evento (ex: certidão de óbito → evento de morte;
-- certidão de batismo → evento de batismo; ata de casamento → union)
create table event_media (
  event_id   uuid not null references events(id) on delete cascade,
  media_id   uuid not null references media(id)  on delete cascade,
  role       text,                  -- 'certificate', 'photo', 'newspaper', 'transcript'...
  primary key (event_id, media_id)
);
create index event_media_media_idx on event_media(media_id);

-- Mídia ligada a uma união (ata/certidão de casamento, álbum de festa)
create table union_media (
  union_id   uuid not null references unions(id) on delete cascade,
  media_id   uuid not null references media(id)  on delete cascade,
  role       text,
  primary key (union_id, media_id)
);
create index union_media_media_idx on union_media(media_id);

-- FK adiada de persons.photo_media_id
alter table persons
  add constraint persons_photo_media_fk
  foreign key (photo_media_id) references media(id) on delete set null;
