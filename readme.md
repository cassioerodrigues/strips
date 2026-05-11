# Stirps

Sistema de árvore genealógica multi-tenant inspirado em ferramentas como MyHeritage e FamilySearch. Foco em registrar com fidelidade relações familiares complexas (múltiplos casamentos, meios-irmãos, adoção, união estável), eventos da vida (batismo, bar/bat mitzvah, imigração, óbito, etc.) e documentos históricos (certidões, fotos, manuscritos).

O projeto está em fase inicial. Esta árvore é, antes de tudo, da família **Bertolini-Albuquerque** (e dos descendentes que possam querer continuar contribuindo); a possibilidade de abrir a plataforma para outras famílias está prevista no design desde o começo.

## Estado atual

| Camada | Estado |
|---|---|
| Mockup do frontend | Pronto (React via CDN, sem build system) |
| Schema do banco | Pronto (PostgreSQL/Supabase, migrations 0001–0008) |
| Seed de dev | Pronto (carrega o mockup no banco) |
| API backend | v1 (FastAPI) |
| Auth & Storage | Schema preparado, integração com Supabase ainda não plugada |
| Integração FamilySearch | Schema preparado (`external_records`, `family_search_id`) |

## Estrutura do repositório

```
.
├── frontend/            mockup React (CDN) — Stirps.html é o entry point
│   ├── components/      JSX components (app, tree, profile, dashboard, ...)
│   ├── scripts/         data.js com FAMILY mockada (19 pessoas, 6 uniões)
│   └── stylesheets/     CSS
└── backend/             schema do banco e seed
    ├── db/migrations/   8 arquivos SQL aplicados em ordem
    ├── db/seed/         script Python que popula o banco a partir do mockup
    ├── requirements-seed.txt
    └── README.md        instruções detalhadas de setup
```

## Como rodar o frontend (mockup)

A versão atual da `main` está sempre disponível em **<http://cassiorodrigues.tech/strips/>** (servida estaticamente pelo nginx do servidor — ver `location /strips/` em `/etc/nginx/sites-available/cassiorodrigues.tech`).

Para rodar localmente, abra `frontend/Stirps.html` direto no navegador ou sirva a pasta com qualquer servidor estático:

```bash
cd frontend
python3 -m http.server 8000
# acesse http://localhost:8000/Stirps.html
```

Os dados vêm de `frontend/scripts/data.js` — ainda não estão ligados ao banco.

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

## Modelo de dados

12 tabelas cobrindo: `profiles`, `trees`, `tree_members`, `persons`, `person_parents`, `unions`, `events`, `media`, `person_media`, `event_media`, `union_media`, `external_records`. Multi-tenancy garantida via Row Level Security do PostgreSQL — cada usuário só enxerga árvores das quais é membro.

Documentos binários (fotos, certidões) ficam no Supabase Storage (bucket `stirps-media`); o banco guarda apenas metadados.

O design completo, com justificativas e DDL, está em `backend/db/migrations/` e no documento de planejamento que acompanha o projeto.

## Próximos passos

1. Escolher framework backend (FastAPI ou Django) e implementar API REST.
2. Plugar autenticação Supabase no frontend.
3. Substituir `data.js` estático por chamadas à API.
4. Subir cliente de Storage para upload de mídia (aba "Galeria" do perfil).
5. Integrar busca em arquivos externos com FamilySearch e congêneres.

## Licença

A definir.
