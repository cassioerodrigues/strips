# Stirps

Sistema de árvore genealógica multi-tenant inspirado em ferramentas como MyHeritage e FamilySearch. Foco em registrar com fidelidade relações familiares complexas (múltiplos casamentos, meios-irmãos, adoção, união estável), eventos da vida (batismo, bar/bat mitzvah, imigração, óbito, etc.) e documentos históricos (certidões, fotos, manuscritos).

O projeto está em fase inicial. Esta árvore é, antes de tudo, da família **Bertolini-Albuquerque** (e dos descendentes que possam querer continuar contribuindo); a possibilidade de abrir a plataforma para outras famílias está prevista no design desde o começo.

## Estado atual

| Camada | Estado |
|---|---|
| Mockup do frontend | Pronto (React via CDN, sem build system) |
| Schema do banco | Pronto (PostgreSQL/Supabase, migrations 0001–0011) |
| Seed de dev | Pronto (carrega o mockup no banco) |
| API backend | v1 (FastAPI) — routers `trees`, `members`, `people`, `parents`, `unions`, `events`, `media`, `external_records`, `stats`, `timeline`, `auth` |
| Auth backend | JWT ES256 via JWKS Supabase (plug no frontend ainda pendente) |
| Storage | Cliente assíncrono pronto (`app/storage.py`); falta plugar no frontend |
| Integração FamilySearch | Schema preparado (`external_records`, `family_search_id`) |

## Estrutura do repositório

```
.
├── frontend/            frontend ativo do projeto; Stirps.html é o entry point
│   ├── components/      JSX components (app, tree, profile, dashboard, modals, ...)
│   ├── scripts/         data.js com FAMILY mockada (19 pessoas, 6 uniões)
│   └── stylesheets/     CSS
├── template/            arquivos estáticos entregues pelo designer. Não é a
│                        pasta do frontend ativo e não deve ser servida em
│                        produção; use apenas como referência visual ao portar
│                        telas, componentes e estilos para frontend/.
├── backend/             FastAPI + schema do banco
│   ├── app/             aplicação (routers, services, schemas, auth, storage)
│   ├── db/migrations/   migrations SQL aplicadas em ordem (0001–0011)
│   ├── db/seed/         script Python que popula o banco a partir do mockup
│   ├── tests/           suíte pytest (unit + integração)
│   └── README.md        instruções detalhadas de setup
├── deploy/              snippets de produção (nginx + systemd)
└── docs/                planos e specs (superpowers/)
```

### Frontend vs. template

- `frontend/` é a implementação usada pelo projeto. Altere esta pasta quando
  for mexer em telas, componentes, estilos, dados mockados ou no Docker/nginx do
  frontend.
- `template/` é material estático de referência produzido pelo designer. Ele
  pode conter versões de telas ainda não portadas, como a página Settings, mas
  não é o source-of-truth da aplicação.
- Ao transformar algo do design em produto, copie/adapte a ideia de
  `template/` para `frontend/`, mantendo os caminhos e padrões já usados pelo
  frontend ativo.

## Como rodar o frontend (mockup)

A versão atual da `main` está sempre disponível em **<http://cassiorodrigues.tech/strips/>** (servida estaticamente pelo nginx do servidor — ver `location /strips/` em `/etc/nginx/sites-available/cassiorodrigues.tech`).

Para rodar localmente, abra `frontend/Stirps.html` direto no navegador ou sirva
a pasta `frontend/` com qualquer servidor estático:

```bash
cd frontend
python3 -m http.server 8000
# acesse http://localhost:8000/Stirps.html
```

Os dados vêm de `frontend/scripts/data.js` — ainda não estão ligados ao banco.

Para validar o container do frontend:

```bash
cd /srv/strips
docker build -t stirps-frontend ./frontend
docker run --rm -p 8080:80 stirps-frontend
# acesse http://127.0.0.1:8080/
```

Em EasyPanel, o frontend expõe a porta interna `80`. No Dockerfile atual da
`main`, o frontend não exige variáveis de ambiente para servir o mockup
estático.

## Como subir o backend

Detalhes em [`backend/README.md`](backend/README.md). Em resumo:

```bash
# 1. Subir Postgres (via Supabase CLI ou Docker direto)
cd backend && supabase start

# 2. Aplicar migrations
for f in db/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done

# 3. Popular com a árvore de exemplo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-seed.txt
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
python db/seed/seed_from_mockup.py
```

Para instalar dependências da API/testes e rodar a suíte sem banco:

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -e '.[dev]'
env -u TEST_DATABASE_URL timeout 60 .venv/bin/pytest -q \
  --ignore=tests/test_routers_auth_trees.py \
  --ignore=tests/test_routers_members.py \
  --ignore=tests/test_routers_unions_events.py \
  --ignore=tests/test_routers_external_records.py \
  --ignore=tests/test_routers_media.py \
  --ignore=tests/test_routers_people.py \
  --ignore=tests/test_routers_timeline.py
```

Baseline local validado em 2026-05-12: `76 passed, 51 skipped, 0 failed in 1.10s`.
Os skips são testes integrados que exigem `TEST_DATABASE_URL`.

Para validar o container do backend:

```bash
cd /srv/strips
docker build -t stirps-backend ./backend
docker run --rm -p 8001:8000 \
  -e DATABASE_URL= \
  -e APP_ENV=development \
  -e CORS_ORIGINS=http://localhost:8000 \
  stirps-backend
# em outra janela:
curl http://127.0.0.1:8001/api/healthz
```

Em EasyPanel, o backend expõe a porta interna `8000`; configure
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_STORAGE_BUCKET` e `CORS_ORIGINS` no painel.

## Modelo de dados

12 tabelas cobrindo: `profiles`, `trees`, `tree_members`, `persons`, `person_parents`, `unions`, `events`, `media`, `person_media`, `event_media`, `union_media`, `external_records`. Multi-tenancy garantida via Row Level Security do PostgreSQL — cada usuário só enxerga árvores das quais é membro.

Documentos binários (fotos, certidões) ficam no Supabase Storage (bucket `stirps-media`); o banco guarda apenas metadados.

O design completo, com justificativas e DDL, está em `backend/db/migrations/` e no documento de planejamento que acompanha o projeto.

## Próximos passos

1. Plugar autenticação Supabase no frontend (login/signup → token ES256).
2. Substituir `data.js` estático por chamadas à API.
3. Conectar upload de mídia ao Supabase Storage (aba "Galeria" do perfil).
4. Portar a página Settings de `template/` para o frontend ativo.
5. Integrar busca em arquivos externos com FamilySearch e congêneres.

## Licença

A definir.
