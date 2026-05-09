# Stirps — Backend

**Stirps** é um sistema de árvore genealógica multi-tenant (como MyHeritage, Ancestry.com) desenvolvido para explorar genealogia de forma colaborativa. Esta pasta contém o schema PostgreSQL do Supabase, as migrations e o script de seed. A API REST e o cliente de Storage ainda estão em desenvolvimento.

## Pré-requisitos

- **Docker** — para rodar Supabase localmente
- **Node.js** — para instalar Supabase CLI (`npm i -g supabase`)
- **Python 3.10+** — para rodar o seed
- **Conta Supabase** — free tier (para deploy em produção)

## Subir o Supabase localmente

```bash
cd /srv/strips/backend
supabase init        # se ainda não inicializado
supabase start       # sobe Postgres + Auth + Storage em Docker
```

Após `supabase start`, você verá:
```
PostgreSQL URL:        postgresql://postgres:postgres@127.0.0.1:54322/postgres
Anon Key:              eyJ...
Service Role Key:      eyJ...
Studio URL:            http://localhost:54323
```

A `DATABASE_URL` para o seed é tipicamente `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Aplicar migrations

### Opção A (recomendada para dev): psql direto

Aplica os arquivos em `db/migrations/` em ordem alfabética. Funciona sem Supabase CLI configurado:

```bash
for f in /srv/strips/backend/db/migrations/*.sql; do
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f "$f"
done
```

### Opção B: Supabase CLI

O Supabase CLI lê migrations de `supabase/migrations/`, não de `db/migrations/`. É necessário sincronizar os arquivos antes de usar `supabase db reset`:

```bash
cd /srv/strips/backend
supabase init                    # cria pasta supabase/
# Sincronizar migrations:
mkdir -p supabase/migrations
for f in db/migrations/*.sql; do
  cp "$f" "supabase/migrations/$(basename "$f")"
done
supabase start
supabase db reset
```

Para produção (`supabase link` + `supabase db push`), o mesmo sync é necessário antes de enviar. Uma opção futura é mover o source-of-truth diretamente para `supabase/migrations/` e remover `db/migrations/`.

## Aplicar em produção (Supabase Cloud)

1. Criar um projeto no dashboard: https://app.supabase.com
2. Copiar a `DATABASE_URL` em **Project Settings** → **Database**
3. Vincular o CLI ao projeto:
   ```bash
   supabase link --project-ref <seu-project-ref>
   ```
4. Enviar migrations:
   ```bash
   supabase db push    # recomendado — preserva dados
   ```

**Alerta:** `supabase db reset` em produção apaga todos os dados. Não use.

## Rodar o seed

> **Atenção — privilégios necessários:** o `DATABASE_URL` usado pelo seed precisa ter privilégios de **superuser ou service-role**, porque o script faz `INSERT INTO auth.users` quando `STIRPS_OWNER_USER_ID` não está definido (modo dev). Em produção, sempre forneça `STIRPS_OWNER_USER_ID` (UUID de um usuário criado via Supabase Auth) para evitar a necessidade do service role.

```bash
cd /srv/strips/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-seed.txt

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
python db/seed/seed_from_mockup.py
```

### Opções úteis

```bash
# Resetar a árvore antes de re-inserir
python db/seed/seed_from_mockup.py --reset

# Apenas simular (sem commitar)
python db/seed/seed_from_mockup.py --dry-run

# Usar data.js customizado
python db/seed/seed_from_mockup.py --data-js /caminho/para/data.js
```

> **AVISO DESTRUTIVO — `--reset`:** deleta a árvore com o mesmo (owner, name) em **cascata**, perdendo todas as pessoas, uniões, mídias e records associados. Use apenas em dev.

### Variáveis de ambiente

- `DATABASE_URL` (obrigatória) — DSN do banco
- `STIRPS_OWNER_USER_ID` (opcional) — UUID de um `auth.users` existente. Se omitido, o script cria um profile de dev "Helena Bertolini Albuquerque" automaticamente.
- `STIRPS_TREE_NAME` (opcional) — nome da árvore (default: "Família Bertolini-Albuquerque")

## Estrutura de tabelas

| Tabela | Propósito |
|--------|-----------|
| `profiles` | Espelha `auth.users` — informações básicas de usuários |
| `trees` | Árvores genealógicas (um projeto por árvore) |
| `tree_members` | Membros e papéis (owner/editor/viewer) em cada árvore |
| `persons` | Pessoas — nomes, gênero, data de nascimento/morte, notas |
| `person_parents` | Filiação — relaciona pessoa aos pais (biológico, adotivo, etc.) |
| `unions` | Casamentos, parcerias, uniões |
| `events` | Eventos GEDCOM (batismo, bar mitzvah, imigração, conscrição, etc.) |
| `media` | Metadados de mídia (fotos, certidões) no Storage |
| `person_media`, `event_media`, `union_media` | Junção N:N entre entidades e mídia |
| `external_records` | Matches com acervos externos (FamilySearch, Ancestry, etc.) |

**Nota:** Dados binários (fotos, certidões digitalizadas) vivem no bucket `stirps-media` do Supabase Storage, não em colunas do banco.

## Multi-tenancy & Row-Level Security (RLS)

Todas as tabelas têm RLS habilitado. O acesso é controlado por funções:
- `is_tree_member(tree_id)` — verifica se o usuário é membro da árvore
- `tree_role(tree_id)` — retorna o papel (owner/editor/viewer)

**Regra:** O usuário só vê árvores das quais é membro. Papéis:
- **owner** — lê e escreve (CRUD completo)
- **editor** — lê e escreve, mas não pode deletar membros ou mudar papéis
- **viewer** — apenas leitura

## Próximos passos

1. Decidir framework backend (FastAPI ou Django) e implementar API REST
2. Plugar Supabase Auth no frontend para login/signup
3. Implementar cliente de Storage para upload de mídia
4. Integrar com FamilySearch (populando `external_records`)
5. Testes automatizados de schema e RLS
