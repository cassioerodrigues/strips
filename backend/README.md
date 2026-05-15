# Stirps — Backend

**Stirps** é um sistema de árvore genealógica multi-tenant (como MyHeritage, Ancestry.com) desenvolvido para explorar genealogia de forma colaborativa. Esta pasta contém a API REST FastAPI, o schema PostgreSQL do Supabase, as migrations, o cliente de Storage e o script de seed.

## Pré-requisitos

- **Docker** — para rodar Supabase localmente
- **Node.js** — para instalar Supabase CLI (`npm i -g supabase`)
- **Python 3.11+** — para rodar a API, testes e seed
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

## Rodar testes

A suíte de testes vive em `backend/tests/` e tem duas camadas:

1. **Unit / smoke tests** (sempre rodam) — validam schemas, helpers e
   roteamento mockando o banco. Não exigem Postgres.
2. **Integration tests** (`test_auth.py`, `test_people.py`, `test_unions.py`,
   `test_media.py`, `test_rls.py`) — usam um banco real e JWTs ES256 assinados
   pelo keypair do `conftest.py`. São **automaticamente pulados** quando
   `TEST_DATABASE_URL` não está no ambiente.

### Setup local de desenvolvimento

As dependências da API e dos testes vêm de `pyproject.toml`:

```bash
cd /srv/strips/backend
python3.11 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -e '.[dev]'
```

### Rodar apenas a parte que não precisa de banco

```bash
cd /srv/strips/backend
.venv/bin/pytest -q
```

Baseline validado em 2026-05-12: em alguns ambientes, esse comando pode
ficar preso ao entrar nos smoke tests de routers que usam
`httpx.AsyncClient(ASGITransport(...))` contra rotas FastAPI síncronas. O
mesmo hang foi reproduzido com `/api/healthz`, então a causa provável é a
combinação não pinada `fastapi==0.136.1`, `starlette==1.0.0`,
`httpx==0.28.1`, `anyio==4.13.0` e `pytest==9.0.3`, não acesso ao banco.

Enquanto essa pilha não for pinada/ajustada, use o comando mitigado para a
suíte sem banco:

```bash
cd /srv/strips/backend
env -u TEST_DATABASE_URL timeout 60 .venv/bin/pytest -q \
  --ignore=tests/test_routers_auth_trees.py \
  --ignore=tests/test_routers_members.py \
  --ignore=tests/test_routers_unions_events.py \
  --ignore=tests/test_routers_external_records.py \
  --ignore=tests/test_routers_media.py \
  --ignore=tests/test_routers_people.py \
  --ignore=tests/test_routers_timeline.py
```

Resultado local validado em 2026-05-12:

```text
76 passed, 51 skipped, 0 failed in 1.10s
```

Os `51 skipped` são testes integrados que dependem de `TEST_DATABASE_URL`.

### Rodar a suíte completa (com Supabase local)

```bash
# 1. Subir Supabase (Postgres + Auth + Storage) localmente
cd /srv/strips/backend
supabase start

# 2. Aplicar migrations (ver seção "Aplicar migrations" acima)
#    Opção mais rápida quando supabase/migrations/ já está sincronizado:
supabase db reset

# 3. Exportar credencial que os testes esperam:
export TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# 4. Rodar a suíte
.venv/bin/pytest -v
```

> O `TEST_DATABASE_URL` precisa ser o DSN de **superuser/service-role** —
> as fixtures inserem em `auth.users` para criar usuários de teste.

### Rodar apenas o test_rls.py (os 6 cenários críticos)

```bash
.venv/bin/pytest tests/test_rls.py -v
```

## Próximos passos

1. Plugar Supabase Auth no frontend para login/signup (token ES256)
2. Trocar `frontend/scripts/data.js` por chamadas à API
3. Conectar upload de mídia ao Supabase Storage no frontend
4. Integrar com FamilySearch (populando `external_records`)

## Subir a API

A API (FastAPI + uvicorn) é a v1 do backend. Roda em `127.0.0.1:8001`
local e é exposta em produção atrás de `https://cassiorodrigues.tech/strips/api/`
via nginx.

### Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env` e preencha. As chaves
obrigatórias são:

- `APP_ENV` — `development` ou `production`. Em `production`, exceções
  não tratadas viram `500` sanitizado.
- `DATABASE_URL` — DSN do Postgres (Supabase).
- `SUPABASE_URL` — URL do projeto Supabase (auth + storage). A URL do JWKS
  ES256 é derivada dela em `app/config.py` (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`).
- `SUPABASE_SERVICE_ROLE_KEY` — usada para emitir URLs assinadas de storage.
- `SUPABASE_STORAGE_BUCKET` — nome do bucket (em prod: `stirps-media`).
- `CORS_ORIGINS` — domínios autorizados a chamar a API, separados por vírgula.

### Rodar localmente

```bash
cd /srv/strips/backend
.venv/bin/uvicorn app.main:app --reload --port 8001
# em outra janela:
curl http://127.0.0.1:8001/api/healthz
```

### Rodar com Docker

Build e healthcheck local:

```bash
cd /srv/strips
docker build -t stirps-backend ./backend
docker run --rm -p 8001:8000 \
  -e DATABASE_URL= \
  -e APP_ENV=development \
  -e CORS_ORIGINS=http://localhost:8000 \
  stirps-backend
curl http://127.0.0.1:8001/api/healthz
```

Resultado esperado:

```json
{"status":"ok"}
```

Para execução com banco real, configure as variáveis de ambiente no runtime:

```bash
docker run --rm -p 8001:8000 --env-file /srv/strips/backend/.env stirps-backend
```

Em EasyPanel, exponha a porta interna `8000` do container e configure as
variáveis no painel. Não dependa de `backend/.env` estar dentro da imagem. Se o
banco estiver fora do container, `127.0.0.1` dentro do `DATABASE_URL` aponta
para o próprio container; use Supabase Cloud, um nome de serviço na rede Docker
ou o host gateway.

### Subir em produção

Os artefatos de deploy estão versionados em `/srv/strips/deploy/`:

```bash
# systemd
cp /srv/strips/deploy/strips-api.service /etc/systemd/system/strips-api.service
systemctl daemon-reload
systemctl enable --now strips-api

# nginx — inserir o snippet de deploy/nginx-strips-api.conf dentro do
# `server { ... }` existente em /etc/nginx/sites-available/cassiorodrigues.tech,
# então:
nginx -t && systemctl reload nginx
```

A API fica disponível em `https://cassiorodrigues.tech/strips/api/`.

### Permissões do `.env`

O unit do systemd roda o serviço como `www-data`. O `/srv/strips/backend/.env`
precisa ser legível por esse usuário — hoje está com modo `644` `root:root`,
o que basta. Se algum dia o modo mudar para `600`, troque o dono para
`www-data:www-data` (ou mantenha `644` para legibilidade global).

## Testar com dados reais (Supabase Cloud via REST API)

Em ambientes corporativos com proxy/firewall, a conexão direta ao PostgreSQL
(porta 5432) pode ser bloqueada. Nesses casos, é possível testar usando a
**REST API do Supabase** (PostgREST), que passa por HTTPS (porta 443).

### Pré-requisitos

1. As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do `.env` raiz
   (ou do dashboard do Supabase em **Project Settings → API**).
2. Python 3.11+ (não precisa de venv nem de dependências extras — usa apenas
   `urllib` e `json` da stdlib).

### Credenciais

```
SUPABASE_URL       = https://<project-ref>.supabase.co
SERVICE_ROLE_KEY   = sb_secret_...   (dashboard → Settings → API → service_role)
```

> **Segurança:** a service role key ignora RLS. Nunca exponha no frontend.

### Script mínimo de consulta

```python
import json, ssl, urllib.request

SUPABASE_URL = "https://<project-ref>.supabase.co"
SERVICE_KEY  = "sb_secret_..."

# Proxy corporativo pode interceptar TLS — desabilitar verificação se necessário
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def rest_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())

# Exemplo: listar pessoas de uma árvore
TREE_ID = "dc8ac34d-..."
persons = rest_get("persons", f"tree_id=eq.{TREE_ID}&select=id,first_name,last_name&order=first_name")
for p in persons:
    print(f"  {p['id']}  {p['first_name']} {p['last_name']}")
```

### Operações CRUD via REST

A REST API do Supabase (PostgREST) suporta GET, POST, PATCH, DELETE:

```python
def rest_patch(table, params, body):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    })
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())

# Exemplo: setar person_id de um membro
rest_patch(
    "tree_members",
    f"tree_id=eq.{TREE_ID}&user_id=eq.{USER_ID}",
    {"person_id": "8b26ea1d-..."},
)
```

### Aplicar migrations (DDL) sem psql

Se a porta 5432 está bloqueada, use o **SQL Editor** no dashboard do Supabase:

1. Acesse https://supabase.com/dashboard → seu projeto → **SQL Editor**
2. Cole o conteúdo do arquivo de migration (ex: `db/migrations/0012_tree_members_person_id.sql`)
3. Clique **Run**

Alternativamente, use o Supabase CLI com `supabase db push` (requer
`supabase link` — o CLI usa a Management API, não conexão direta ao Postgres).

### Por que não usar psycopg direto?

| Método | Porta | Funciona com proxy? |
|--------|-------|---------------------|
| `psycopg.connect(DSN)` | 5432 (TCP) | ❌ Bloqueada em muitas redes corporativas |
| REST API (`/rest/v1/`) | 443 (HTTPS) | ✅ Passa pelo proxy normalmente |
| Supabase CLI (`db push`) | HTTPS (Management API) | ✅ |
| SQL Editor (dashboard) | 443 (HTTPS) | ✅ |

### Dica: NODE_TLS_REJECT_UNAUTHORIZED

Se o proxy corporativo intercepta certificados TLS (MITM), chamadas HTTPS
ao Supabase podem falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Para os
testes do frontend (Node.js):

```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0   # PowerShell / Windows
export NODE_TLS_REJECT_UNAUTHORIZED=0 # bash / Linux
node tests/tree-layout.test.js
```

Para Python, o equivalente é o `ssl` context com `verify_mode = ssl.CERT_NONE`
mostrado acima.
