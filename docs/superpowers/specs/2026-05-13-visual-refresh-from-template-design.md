# Visual Refresh from Template — Design

**Status:** Approved
**Author:** Cassio E. Rodrigues (via Claude Code)
**Date:** 2026-05-13

## Context

O diretório `/srv/strips/template/` contém uma versão mais recente do mockup do
frontend, produzida pelo designer. O frontend ativo em `/srv/strips/frontend/`
divergiu dessa base porque recebeu, em cima do mockup original, a integração
com Supabase Auth (`auth.js`, `auth-screen.jsx`), o cliente de API
(`api.js`, `adapters.js`), e os hooks `useTree`/`usePerson`
(`tree-data.js`, `tree-layout.js`). Vários arquivos do designer trazem refresh
visual e features novas (notadamente uma página `Settings` completa) que ainda
não chegaram ao site em produção.

O objetivo desta entrega é trazer o refresh visual e a página Settings para o
frontend ativo, **sem regredir** auth, integração com API ou o seed expandido
de `data.js`.

## Goal

Aplicar todas as mudanças visuais e a página Settings do template no frontend
ativo, preservando integralmente:

- Fluxo de autenticação Supabase (`auth.js`, `auth-screen.jsx`, gate em `app.jsx`).
- Integração com API (`api.js`, `adapters.js`, `tree-data.js`, `tree-layout.js`).
- Hooks `useAuth`, `useTree`, `usePerson` e seu uso atual nos componentes.
- Seed expandido em `frontend/scripts/data.js` (commit `a121f54`).

## Non-Goals

- Reescrever o algoritmo de layout da árvore (rastreado na issue #32).
- Substituir o `data.js` atual pelo do template — manter o seed expandido.
- Implementar persistência real para ações de Settings (mock data interno é
  aceitável para o MVP).
- Refatorações fora do escopo do refresh (DRY, perf, etc).

## Inventory of Differences

Levantamento feito via `diff -u template/... frontend/...`:

| Arquivo | Diff (linhas) | Natureza |
|---|---|---|
| `stylesheets/styles.css` | 404 add / 184 del | Refresh visual + estilos novos de Settings |
| `components/settings.jsx` | NEW (561 linhas) | Página nova completa (drop-in) |
| `Stirps.html` | 49 | Frontend tem scripts auth/api/etc; template tem `settings.jsx` |
| `components/app.jsx` | 104 | Frontend adicionou auth gate + `useTree` + `lookupPersonName`; template registra rota `settings` |
| `components/modals.jsx` | 379 (template maior) | Refinamentos visuais nos 3 modais existentes (sem modais novos) |
| `components/tree.jsx` | 150 | Refresh visual; preservar `useTree` + `tree-layout.computeApiTreeLayout` |
| `components/profile.jsx` | 137 | Refresh visual; preservar `usePerson` |
| `components/other-pages.jsx` | 149 | People/Timeline/Search/Documents — Timeline/People usam `useTree` |
| `components/dashboard.jsx` | 58 | Refresh visual; verificar dependência de hooks |
| `components/components.jsx` | 10 | Shared components |
| `components/mobile.jsx` | 9 | Visual puro |
| `components/ios-frame.jsx` | 0 | Idêntico — no-op |
| `components/tweaks-panel.jsx` | 0 | Idêntico — no-op |
| `scripts/data.js` | 157 (template menor) | **Não aplicar** — manter seed expandido |

## Architecture

Branch dedicada `chore/visual-refresh-from-template`, três fases sequenciais,
um commit por fase, checkpoint visual entre elas (deploy intermediário se
desejado; senão validação local via diff).

**Política de merge — "lógica vence":** preservar hooks/integração API. Se o
designer assumiu shape de dados diferente do que a API entrega, adaptar o
markup para usar a forma que já temos.

## Phase 1 — Drop-ins seguros

Sem conflito real entre nossas mudanças e o template.

**Arquivos:**

- `frontend/stylesheets/styles.css` — substituir pelo do template, após preflight check (ver Risco 1).
- `frontend/components/settings.jsx` — copiar do template (arquivo novo).
- `frontend/components/ios-frame.jsx`, `frontend/components/tweaks-panel.jsx` — confirmar via `diff` que são idênticos; nenhuma escrita.
- `frontend/Stirps.html` — adicionar uma linha `<script type="text/babel" src="components/settings.jsx"></script>` imediatamente **antes** de `app.jsx`. Não remover nenhum dos scripts atuais.
- `frontend/components/app.jsx:51-52` — trocar a gambiarra:
  ```js
  if (r === "settings" || r === "help") { setRoute("dashboard"); }
  ```
  por uma rota real para `settings`, mantendo `help` na gambiarra ou criando rota stub.

**Preflight (Risco 1):**

Antes de sobrescrever o CSS, rodar:
```
grep -E 'auth-screen|auth-card|auth-tab|auth-eyebrow|auth-error|auth-form|auth-foot|auth-link|auth-success|auth-loading' \
  template/frontend/stylesheets/styles.css
```

Se algum desses seletores não estiver no CSS do template, extrair o bloco
correspondente do CSS atual e anexar ao final do CSS novo (preservando os
estilos do `auth-screen.jsx`, que é nosso).

**Checkpoint:** após Fase 1, abrir o site, fazer login e verificar:
- Login screen continua estilizada corretamente.
- Rota `settings` renderiza `<SettingsPage/>` sem crashar.
- Refresh visual aparece nas outras páginas (pelo CSS novo).

## Phase 2 — Visual de baixo/médio risco

**Arquivos:**

- `frontend/components/mobile.jsx` — aplicar diff do template (9 linhas).
- `frontend/components/components.jsx` — aplicar diff do template (10 linhas), verificando se algum shared component (Avatar, Icon, fmtLifespan) muda assinatura.
- `frontend/components/dashboard.jsx` — Dashboard atual **usa `useTree`** (`dashboard.jsx:9`). Adaptar o markup do template para consumir `tree.people/tree.stats` e preservar o fallback `window.FAMILY` quando `tree.status === "unavailable"`.
- `frontend/components/other-pages.jsx` — quatro páginas dentro:
  - `PeoplePage` — usa `useTree` para listar pessoas; adaptar markup.
  - `TimelinePage` — usa `useTree` para timeline; adaptar markup.
  - `SearchPage` — verificar dependência atual; provavelmente FAMILY-only ainda.
  - `DocumentsPage` — provavelmente FAMILY-only.

**Processo por arquivo:** ler template, ler frontend, identificar onde nossa
lógica está, produzir merge manual no editor, diff visual de revisão.

**Checkpoint:** após Fase 2, navegar pelas páginas internas e confirmar que
visual atualizou sem regredir dados.

## Phase 3 — Crítico (modais + tree + profile)

**Arquivos:**

- `frontend/components/modals.jsx` (379 linhas diff, template maior):
  - Ambos os lados têm os mesmos 3 modais — `EditPersonModal`, `AddEventModal`, `AddPersonModal` — sem modais novos. As 379 linhas são refinamentos visuais + provavelmente campos novos no `AddEventModal` (que cresceu mais).
  - Aplicar diff template→frontend em cada um, preservando handlers (`onSave`, lógica que chama API ou atualiza estado pai).
- `frontend/components/tree.jsx` (150 linhas diff):
  - Preservar `apiCanRender`, `apiLayout`, `mockLayout`, `peopleById` (linhas 148-163 do atual).
  - Aplicar refresh visual no TreeNode, HoverCard, zoom controls, legend.
  - Manter `window.treeLayout.computeApiTreeLayout(people, unions, relationsByChild)`.
- `frontend/components/profile.jsx` (137 linhas diff):
  - Preservar `usePerson(personId)` e os estados `idle/loading/ready/empty/error/fallback`.
  - Aplicar refresh visual nas seções (cabeçalho, bio, relações, eventos).
- `frontend/components/app.jsx` — passagem final, juntando ajustes residuais.

**Checkpoint final:** validação completa antes de mergear:
- Smoke test em cada rota (dashboard, tree, profile, people, search, documents, timeline, settings, mobile).
- Auth flow: logout → login → árvore carrega.
- `curl https://strips.cassiorodrigues.tech/api/me` continua respondendo (deploy é o gatilho final, não a edição de arquivos).

## Testing

Frontend tem 3 testes automatizados em `frontend/tests/`: `auth-state.test.js`,
`family-data.test.js`, `tree-layout.test.js`. Eles cobrem store de auth, dados
do FAMILY mock e o algoritmo de layout — não cobrem visual nem rendering de
componentes. Rodar antes de cada commit para garantir que a fase não regrediu
auth-state nem o `computeApiTreeLayout`. Validação visual continua manual;
commits separados permitem revert isolado.

Smoke checklist por fase:
- **Fase 1:** login screen ok, rota settings renderiza, visual refresh visível.
- **Fase 2:** páginas People/Timeline com dados da API + visual novo.
- **Fase 3:** árvore renderiza (mesmo com o bug de layout #32, que é independente), profile abre, modais com refresh visual aplicado.

## Risks & Mitigations

1. **CSS do template não contém classes do `auth-screen.jsx`.**
   Mitigação: preflight `grep` antes de sobrescrever. Se faltar, anexar bloco
   `auth-*` do CSS atual ao final do novo.

2. **`settings.jsx` usa mock data (FAMILY).**
   Mitigação: aceito para o MVP. Settings funciona visualmente; persistência
   fica em issue de follow-up.

3. **Modais com campos novos podem exigir state/handlers adicionais.**
   Mitigação: não há modais inteiramente novos (mesma lista nos dois lados).
   Para campos novos dentro de `AddEventModal` / `EditPersonModal` /
   `AddPersonModal`, preservar a forma do `onSave` atual; se o template
   introduz campos cujo handler não existe, ou estender o handler atual
   ou aceitar que o campo é display-only por enquanto e abrir issue.

4. **Tempo da Fase 3.**
   Mitigação: se Fase 3 ficar maior que esperado, dividir em 3a (modais),
   3b (tree+profile), 3c (app.jsx + cleanup) — sempre com commit separado.

## Git Strategy

- Branch: `chore/visual-refresh-from-template` a partir de `main` (`e6dbbb3`).
- Commits:
  - `chore(frontend): visual refresh fase 1 — CSS + Settings + drop-ins`
  - `chore(frontend): visual refresh fase 2 — mobile/components/dashboard/other-pages`
  - `chore(frontend): visual refresh fase 3 — modals/tree/profile/app`
- Merge na `main` por PR ao final, com lista de checagens do smoke.
- Deploy via EasyPanel após merge.

## Open Questions

Nenhuma bloqueante; decisões já tomadas:
- Política de conflito: lógica vence.
- `data.js`: manter o atual.
- Settings: aceitar mock data internamente; persistência depois.
