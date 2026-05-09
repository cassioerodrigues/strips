-- Migration 0001: extensions and enum types
-- Installs required PostgreSQL extensions and defines all domain enums for the Stirps schema.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "citext";         -- emails case-insensitive

create type sex_t           as enum ('M','F','O','U');     -- masc, fem, outro/não-binário, desconhecido
create type tree_role_t     as enum ('owner','editor','viewer');
create type union_type_t    as enum ('marriage','civil_union','partnership','engagement','other');
create type union_status_t  as enum ('ongoing','divorced','widowed','annulled','separated','ended');
create type parent_kind_t   as enum ('biological','adoptive','step','foster','legal','unknown');
create type event_type_t    as enum (
  -- religiosos / ritos de passagem
  'baptism','christening','confirmation','first_communion',
  'bar_mitzvah','bat_mitzvah','ordination','blessing',
  -- vida
  'adoption','engagement','graduation','retirement','occupation',
  'education','military','residence',
  -- migração
  'immigration','emigration','naturalization',
  -- registros oficiais
  'census','will','probate','obituary',
  -- pós-morte
  'burial','cremation',
  -- escape hatch
  'religion','custom'
);
create type media_kind_t    as enum ('photo','document','audio','video','other');
create type record_status_t as enum ('suggested','accepted','rejected');
