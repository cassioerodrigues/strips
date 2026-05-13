# Visual Refresh from Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o refresh visual e a página Settings do mockup do designer (em `/srv/strips/template/`) ao frontend ativo, em 3 fases, sem regredir auth, integração API ou o seed expandido.

**Architecture:** 3 fases sequenciais, 1 commit por fase, na branch `chore/visual-refresh-from-template`. Política de merge: "lógica vence" — preserva todos os hooks (`useAuth`, `useTree`, `usePerson`), integração API (`api.js`, `adapters.js`), `auth-screen.jsx` e seu CSS, fluxo de auth no `app.jsx`. Onde o designer assumiu shape de dados diferente, adapta o markup novo para usar o shape que a API já entrega.

**Tech Stack:** React 18 (UMD), Babel standalone (JSX in-browser), Supabase JS SDK, nginx container servido pelo EasyPanel. Testes em Node usando `node --test` (3 testes existentes em `frontend/tests/`).

**Context:**
- Spec: `docs/superpowers/specs/2026-05-13-visual-refresh-from-template-design.md`
- Branch base: `chore/visual-refresh-from-template` (já criada, no commit `efd118b`)
- Repo: `/srv/strips`
- Template (read-only): `/srv/strips/template/`
- Frontend ativo: `/srv/strips/frontend/`
- `data.js` NÃO é modificado em nenhuma task (manter o seed expandido)
- `ios-frame.jsx` e `tweaks-panel.jsx` são idênticos nos dois lados — não tocar

---

## File Structure

**Phase 1** modifica/cria:
- `frontend/stylesheets/styles.css` (overwrite + preservar bloco auth-*)
- `frontend/components/settings.jsx` (create from template)
- `frontend/Stirps.html` (insert 1 script line)
- `frontend/components/app.jsx` (replace settings gambiarra)

**Phase 2** modifica:
- `frontend/components/mobile.jsx`
- `frontend/components/components.jsx`
- `frontend/components/dashboard.jsx`
- `frontend/components/other-pages.jsx`

**Phase 3** modifica:
- `frontend/components/modals.jsx`
- `frontend/components/tree.jsx`
- `frontend/components/profile.jsx`
- `frontend/components/app.jsx` (segunda passada residual)

---

## How to test

Frontend tem 3 testes em Node (`frontend/tests/`):
- `auth-state.test.js` — store de auth (loading → misconfigured/unauthenticated)
- `family-data.test.js` — validações sobre o FAMILY mock
- `tree-layout.test.js` — `computeApiTreeLayout`

Para rodar todos:
```bash
cd /srv/strips/frontend && node --test tests/
```
Esperado em qualquer commit dessa branch: **3 suites passando, 0 falhas**.

Smoke manual entre fases:
- Abrir `frontend/Stirps.html` localmente (não precisa do servidor — basta um http-server simples) **OU** aguardar deploy intermediário.
- Conferir o checklist específico ao final de cada fase.

**IMPORTANTE — antes de qualquer task que mexa em `.jsx` ou `.html`:** rodar `node --test tests/` para garantir baseline verde. Se falhar antes da task começar, parar e investigar.

---

## Phase 1 — Drop-ins seguros

### Task 1.1: Preflight CSS — verificar classes do auth-screen

**Files:**
- Read: `frontend/components/auth-screen.jsx`
- Read: `frontend/stylesheets/styles.css`
- Read: `template/frontend/stylesheets/styles.css`
- Output: `/tmp/auth-css-classes.txt`, `/tmp/auth-css-extract.css`

O CSS do template foi feito antes do `auth-screen.jsx` existir. Antes de
sobrescrever, extrair o bloco do CSS atual referente ao auth-screen para
anexar depois.

- [ ] **Step 1: Extrair lista de classes usadas no auth-screen.jsx**

```bash
cd /srv/strips
grep -oE 'className="[^"]+"' frontend/components/auth-screen.jsx \
  | sed -E 's/className="//; s/"$//' \
  | tr ' ' '\n' \
  | sort -u \
  | grep -E '^auth-' \
  > /tmp/auth-css-classes.txt
cat /tmp/auth-css-classes.txt
```

Esperado: imprime ~13 classes (`auth-screen`, `auth-screen-loading`, `auth-loading-dot`, `auth-loading-text`, `auth-card`, `auth-card-info`, `auth-eyebrow`, `auth-title`, `auth-lede`, `auth-error`, `auth-foot`, `auth-brand`, `auth-brand-mark`, `auth-brand-text`, `auth-brand-sub`, `auth-tabs`, `auth-tab`, `auth-tab-on`, `auth-success`, `auth-email`, `auth-form`, `auth-label`, `auth-submit`, `auth-hint`, `auth-link`).

- [ ] **Step 2: Verificar se o CSS do template tem alguma dessas classes**

```bash
cd /srv/strips
while read -r cls; do
  if grep -q "\.$cls" template/frontend/stylesheets/styles.css; then
    echo "TEMPLATE TEM: .$cls"
  else
    echo "TEMPLATE FALTA: .$cls"
  fi
done < /tmp/auth-css-classes.txt
```

Esperado: várias linhas "TEMPLATE FALTA" — é o que confirma que precisamos preservar.

- [ ] **Step 3: Extrair os blocos `.auth-*` do CSS atual para reuso**

```bash
cd /srv/strips
awk '
  /^\.auth-/ { capture=1 }
  capture { print; if ($0 ~ /^}/) capture=0 }
' frontend/stylesheets/styles.css > /tmp/auth-css-extract.css
wc -l /tmp/auth-css-extract.css
head -5 /tmp/auth-css-extract.css
```

Esperado: ~50-150 linhas extraídas, começando com `.auth-screen { ... }` ou similar.

Se o arquivo ficar com menos de 20 linhas, o `awk` não capturou o bloco corretamente — parar e investigar manualmente lendo a seção `auth-*` do `frontend/stylesheets/styles.css` (procurar com `grep -n '\.auth-' frontend/stylesheets/styles.css | head`).

- [ ] **Step 4: Commit não é necessário aqui — saída em /tmp só.** Próxima task usa `/tmp/auth-css-extract.css`.

---

### Task 1.2: Copiar CSS e preservar bloco auth-*

**Files:**
- Modify (overwrite): `frontend/stylesheets/styles.css`
- Input: `template/frontend/stylesheets/styles.css`, `/tmp/auth-css-extract.css`

- [ ] **Step 1: Copiar CSS do template para o frontend**

```bash
cp /srv/strips/template/frontend/stylesheets/styles.css \
   /srv/strips/frontend/stylesheets/styles.css
```

- [ ] **Step 2: Anexar o bloco auth-* ao final**

```bash
{
  echo ""
  echo "/* ============================================================ */"
  echo "/* auth-screen — preservado do CSS pré-refresh (auth-screen.jsx) */"
  echo "/* ============================================================ */"
  cat /tmp/auth-css-extract.css
} >> /srv/strips/frontend/stylesheets/styles.css
```

- [ ] **Step 3: Verificar que o arquivo final tem todas as classes necessárias**

```bash
cd /srv/strips
while read -r cls; do
  if grep -q "\.$cls" frontend/stylesheets/styles.css; then
    echo "OK: .$cls"
  else
    echo "FALTA: .$cls"
  fi
done < /tmp/auth-css-classes.txt | sort | uniq -c | sort -rn | head -5
```

Esperado: todas as classes aparecem como "OK". Se alguma sair como "FALTA", o `awk` da Task 1.1 perdeu — refazer Step 3 da Task 1.1 com extração manual:
```bash
grep -A 30 '^\.auth-' frontend/stylesheets/styles.css.bak > /tmp/auth-css-extract.css
```
(precisa fazer backup antes de sobrescrever o CSS se for tentar isso — então parar a fase, voltar e refazer).

- [ ] **Step 4: Verificação manual de tamanho**

```bash
wc -l /srv/strips/template/frontend/stylesheets/styles.css \
      /srv/strips/frontend/stylesheets/styles.css
```

Esperado: frontend > template (porque adicionamos o bloco auth-* no final). Diferença ~50-150 linhas.

---

### Task 1.3: Adicionar settings.jsx

**Files:**
- Create: `frontend/components/settings.jsx`
- Input: `template/frontend/components/settings.jsx`

- [ ] **Step 1: Copiar settings.jsx do template**

```bash
cp /srv/strips/template/frontend/components/settings.jsx \
   /srv/strips/frontend/components/settings.jsx
```

- [ ] **Step 2: Verificar que define `window.SettingsPage`**

```bash
grep -n 'window.SettingsPage' /srv/strips/frontend/components/settings.jsx
```

Esperado: pelo menos uma linha com `window.SettingsPage = SettingsPage;`. Se não aparecer, ler o arquivo e ver como ele é exportado:
```bash
grep -nE '^(window\.|function SettingsPage|export )' /srv/strips/frontend/components/settings.jsx | head
```
Se houver definição `function SettingsPage` mas sem `window.SettingsPage = ...`, adicionar manualmente ao final do arquivo:
```js
window.SettingsPage = SettingsPage;
```

- [ ] **Step 3: Conferir que não tenta `import`**

```bash
grep -c '^import ' /srv/strips/frontend/components/settings.jsx
```

Esperado: `0`. O frontend roda Babel standalone in-browser, não suporta ES modules. Se aparecer `import`, ler e converter pra `const X = window.X` no topo.

---

### Task 1.4: Verificar idêntico — ios-frame.jsx e tweaks-panel.jsx

**Files:**
- Read-only: `frontend/components/ios-frame.jsx`, `frontend/components/tweaks-panel.jsx`
- Compare: `template/frontend/components/ios-frame.jsx`, `template/frontend/components/tweaks-panel.jsx`

- [ ] **Step 1: Diff**

```bash
diff /srv/strips/template/frontend/components/ios-frame.jsx \
     /srv/strips/frontend/components/ios-frame.jsx
echo "ios-frame exit=$?"

diff /srv/strips/template/frontend/components/tweaks-panel.jsx \
     /srv/strips/frontend/components/tweaks-panel.jsx
echo "tweaks-panel exit=$?"
```

Esperado: ambos `exit=0` (sem output, arquivos idênticos). Se algum tiver diff, ler e decidir — mas a auditoria já confirmou que são iguais.

---

### Task 1.5: Atualizar Stirps.html — adicionar script settings.jsx

**Files:**
- Modify: `frontend/Stirps.html`

A ordem dos scripts importa. `settings.jsx` deve carregar **antes** de `app.jsx` (que referencia `window.SettingsPage`).

- [ ] **Step 1: Inspecionar o bloco de scripts atual**

```bash
grep -n '<script' /srv/strips/frontend/Stirps.html
```

Esperado: linha contendo `<script type="text/babel" src="components/mobile.jsx"></script>`, seguida de `<script type="text/babel" src="components/auth-screen.jsx"></script>`, e por último `<script type="text/babel" src="components/app.jsx"></script>`.

- [ ] **Step 2: Inserir `settings.jsx` antes de `app.jsx`**

Inserir esta linha imediatamente **antes** da linha do `app.jsx` no `Stirps.html`:
```html
<script type="text/babel" src="components/settings.jsx"></script>
```

A linha-alvo a procurar é:
```html
<script type="text/babel" src="components/app.jsx"></script>
```

Pode-se usar Edit tool com:
- `old_string`: `<script type="text/babel" src="components/auth-screen.jsx"></script>\n<script type="text/babel" src="components/app.jsx"></script>`
- `new_string`: `<script type="text/babel" src="components/auth-screen.jsx"></script>\n<script type="text/babel" src="components/settings.jsx"></script>\n<script type="text/babel" src="components/app.jsx"></script>`

- [ ] **Step 3: Verificar**

```bash
grep -n 'settings.jsx\|auth-screen.jsx\|app.jsx' /srv/strips/frontend/Stirps.html
```

Esperado: 3 linhas, com `auth-screen.jsx` antes de `settings.jsx`, que vem antes de `app.jsx`.

---

### Task 1.6: Atualizar app.jsx — trocar gambiarra por rota real

**Files:**
- Modify: `frontend/components/app.jsx`

O frontend atual (linhas ~50-58 do `app.jsx`) tem:
```js
function navigate(r) {
  if (r === "settings" || r === "help") {
    // pretend page
    setRoute("dashboard");
  } else {
    setRoute(r);
  }
}
```

E o bloco de render (linhas ~121-128) NÃO tem `route === "settings"` listado.
Vamos:
1. Tirar `settings` da gambiarra do `navigate`.
2. Adicionar `{route === "settings" && <SettingsPage onPersonClick={openPerson}/>}` no bloco de render.

- [ ] **Step 1: Ler estado atual da função `navigate` e do bloco de render**

```bash
sed -n '50,60p' /srv/strips/frontend/components/app.jsx
echo '---'
sed -n '118,135p' /srv/strips/frontend/components/app.jsx
```

Confirmar que o conteúdo bate com o esperado (gambiarra `r === "settings" || r === "help"` está lá).

- [ ] **Step 2: Trocar a gambiarra do `navigate`**

Edit:
- `old_string`:
  ```
  function navigate(r) {
      if (r === "settings" || r === "help") {
        // pretend page
        setRoute("dashboard");
      } else {
        setRoute(r);
      }
    }
  ```
- `new_string`:
  ```
  function navigate(r) {
      if (r === "help") {
        // pretend page
        setRoute("dashboard");
      } else {
        setRoute(r);
      }
    }
  ```

(Se a indentação no arquivo diferir, ajustar — o Edit tool exige match exato.)

- [ ] **Step 3: Adicionar `settings` ao mapa de breadcrumbs**

Ler primeiro:
```bash
grep -n 'mobile: \["Stirps"' /srv/strips/frontend/components/app.jsx
```

Localizar o map de breadcrumbs (já tem `dashboard/tree/profile/search/documents/people/timeline/mobile`).

Edit:
- `old_string`:
  ```
  mobile: ["Stirps", "Mobile companion"],
      };
  ```
- `new_string`:
  ```
  mobile: ["Stirps", "Mobile companion"],
        settings: ["Stirps", "Configurações"],
      };
  ```

- [ ] **Step 4: Adicionar render de `<SettingsPage/>`**

Ler primeiro:
```bash
grep -n 'route === "mobile"' /srv/strips/frontend/components/app.jsx
```

Localizar a linha do `MobileShowcase`. Inserir a rota de settings logo antes do MobileShowcase.

Edit:
- `old_string`:
  ```
  {route === "mobile" && <MobileShowcase onClose={() => setRoute("dashboard")}/>}
  ```
- `new_string`:
  ```
  {route === "settings" && window.SettingsPage && <window.SettingsPage onPersonClick={openPerson}/>}
          {route === "mobile" && <MobileShowcase onClose={() => setRoute("dashboard")}/>}
  ```

Nota: usar `window.SettingsPage && <window.SettingsPage .../>` em vez de `<SettingsPage .../>` direto porque `SettingsPage` é definido em script separado que pode falhar em carregar — fallback gracioso. É o mesmo padrão usado pelo `AddPersonModal` em `tree.jsx:288`.

- [ ] **Step 5: Verificar sintaxe — abrir o arquivo num parser**

```bash
cd /srv/strips/frontend
node --check components/app.jsx 2>&1 || echo "Esperado: erro de syntax porque .jsx tem JSX (não é JS puro). Confirmar que o erro é de JSX, não de chave/colchete não-fechado."
```

Esperado: o erro deve mencionar `Unexpected token '<'` (JSX). Se aparecer "Unexpected end of input" ou erro de chave não-fechada, voltar e revisar.

---

### Task 1.7: Smoke test + testes automatizados (Fase 1)

**Files:** nenhum, só verificação.

- [ ] **Step 1: Rodar testes automatizados**

```bash
cd /srv/strips/frontend && node --test tests/ 2>&1 | tail -20
```

Esperado: `# pass 3` (ou maior, contando sub-tests) e `# fail 0`.

- [ ] **Step 2: Smoke local — servir o frontend num http-server**

```bash
cd /srv/strips/frontend && python3 -m http.server 8765 >/tmp/http.log 2>&1 &
HTTP_PID=$!
sleep 1
# Teste o config local — sem Supabase, deve cair no AuthMisconfigured.
# A página principal deve responder e o JS principal deve carregar.
curl -sS -w 'HTTP %{http_code}\n' -o /tmp/local.html http://localhost:8765/Stirps.html | tail -1
grep -c 'settings.jsx' /tmp/local.html
curl -sS -o /dev/null -w 'settings.jsx HTTP %{http_code}\n' http://localhost:8765/components/settings.jsx
curl -sS -o /dev/null -w 'styles.css HTTP %{http_code}\n' http://localhost:8765/stylesheets/styles.css
kill $HTTP_PID
```

Esperado:
- HTML responde 200
- `settings.jsx` aparece 1x na HTML
- `settings.jsx` responde 200
- `styles.css` responde 200

- [ ] **Step 3: Commit**

```bash
cd /srv/strips
git add frontend/stylesheets/styles.css \
        frontend/components/settings.jsx \
        frontend/Stirps.html \
        frontend/components/app.jsx
git status
git commit -m "$(cat <<'EOF'
chore(frontend): visual refresh fase 1 — CSS + Settings + drop-ins

- Aplica o styles.css novo do designer, anexando o bloco .auth-* preservado
  do CSS pré-refresh (auth-screen.jsx não existia na época do template).
- Adiciona frontend/components/settings.jsx (drop-in do template).
- Adiciona <script> de settings.jsx no Stirps.html (antes de app.jsx).
- Substitui a gambiarra de "r === 'settings' → dashboard" no app.jsx por
  rota real renderizando <window.SettingsPage/>, com fallback gracioso se
  o script ainda não carregou.

Política: lógica vence. Auth/API intactos.
EOF
)"
```

- [ ] **Step 4: Verificar commit**

```bash
git log --oneline -1
git diff HEAD~1 --stat
```

Esperado: 1 commit "chore(frontend): visual refresh fase 1 ..." listando 4 arquivos.

---

## Phase 2 — Visual JSX de baixo/médio risco

### Task 2.1: mobile.jsx (9 linhas diff)

**Files:**
- Read: `template/frontend/components/mobile.jsx`, `frontend/components/mobile.jsx`
- Modify: `frontend/components/mobile.jsx`

- [ ] **Step 1: Inspecionar o diff completo**

```bash
diff -u /srv/strips/frontend/components/mobile.jsx \
        /srv/strips/template/frontend/components/mobile.jsx
```

Diff tem 9 linhas. Análise:
- Se as mudanças do template são **puramente visuais** (classes, texto, estrutura JSX) e o frontend não tem nada de `useTree/useAuth/usePerson` no arquivo, então a estratégia é **copiar o template inteiro**.
- Se o frontend tem código adicional (hooks, integração), aplicar só as mudanças visuais manualmente.

Confirmar com:
```bash
grep -nE 'useAuth|useTree|usePerson|window\.api' /srv/strips/frontend/components/mobile.jsx
```

Esperado: 0 hits. Se for 0, pode copiar diretamente.

- [ ] **Step 2: Copiar do template (se Step 1 confirmou 0 hits)**

```bash
cp /srv/strips/template/frontend/components/mobile.jsx \
   /srv/strips/frontend/components/mobile.jsx
```

- [ ] **Step 3: Confirmar que define `window.MobileShowcase`**

```bash
grep -n 'window.MobileShowcase' /srv/strips/frontend/components/mobile.jsx
```

Esperado: `window.MobileShowcase = MobileShowcase;` ou similar. Se não aparecer, adicionar manualmente ao final.

---

### Task 2.2: components.jsx (10 linhas diff)

**Files:**
- Read: `template/frontend/components/components.jsx`, `frontend/components/components.jsx`
- Modify: `frontend/components/components.jsx`

- [ ] **Step 1: Inspecionar o diff e detectar dependências**

```bash
diff -u /srv/strips/frontend/components/components.jsx \
        /srv/strips/template/frontend/components/components.jsx

grep -nE 'useAuth|useTree|usePerson|window\.api' /srv/strips/frontend/components/components.jsx
```

Se 0 hits de hooks, copiar inteiro do template (Step 2). Se houver hits, aplicar diff visual manualmente preservando as linhas com hooks.

- [ ] **Step 2: Copiar do template (caso seguro)**

```bash
cp /srv/strips/template/frontend/components/components.jsx \
   /srv/strips/frontend/components/components.jsx
```

- [ ] **Step 3: Verificar exports**

```bash
grep -nE '^window\.' /srv/strips/frontend/components/components.jsx
```

Esperado: linhas como `window.Sidebar = ...`, `window.TopBar = ...`, `window.CommandPalette = ...`, `window.Avatar = ...`, `window.Icon = ...`. Conferir que todos os componentes referenciados em `app.jsx` (Sidebar, TopBar, CommandPalette, fmtLifespan, Avatar, Icon) estão exportados.

```bash
grep -oE 'window\.(Sidebar|TopBar|CommandPalette|Avatar|Icon|fmtLifespan)' \
     /srv/strips/frontend/components/components.jsx | sort -u
```

Esperado: lista de pelo menos 5 desses 6 nomes (fmtLifespan pode estar inline).

---

### Task 2.3: dashboard.jsx (58 linhas diff, USA `useTree`)

**Files:**
- Read: `template/frontend/components/dashboard.jsx`, `frontend/components/dashboard.jsx`
- Modify: `frontend/components/dashboard.jsx`

Esta é a primeira task de Fase 2 com conflito real. O frontend atual tem
(`dashboard.jsx:4-9`):
```js
function Dashboard({ onNavigate, onPersonClick }) {
  const F = window.FAMILY;
  // useTree() é o snapshot oficial da árvore ativa via API. Quando
  // disponível ("ready"), preferimos ele; em qualquer outro estado (loading/
  // unavailable/error) caímos no agregado do FAMILY mock para manter a UI
  // utilizável durante dev e como fallback se a API falhar.
  const tree = window.useTree ? window.useTree() : { status: "unavailable", stats: null };
  // ...
```

E há um bloco de error UI (`dashboard.jsx:62`):
```jsx
Não foi possível atualizar os contadores agora.
<button className="link" onClick={() => window.useTree && window.useTree.refetch && window.useTree.refetch()}>Tentar novamente</button>
```

Esses dois trechos DEVEM SOBREVIVER.

- [ ] **Step 1: Estudar o que muda no template**

```bash
diff -u /srv/strips/frontend/components/dashboard.jsx \
        /srv/strips/template/frontend/components/dashboard.jsx | head -100
```

Identificar: o diff é (a) visual puro nas classes/markup, (b) novos cards/seções, ou (c) mudança na assinatura de Dashboard.

- [ ] **Step 2: Estratégia "lógica vence"**

Não copiar o template inteiro. Em vez disso:
1. Abrir os dois arquivos lado a lado.
2. No frontend atual, identificar o `return ( ... )` do `Dashboard`.
3. Substituir só o conteúdo do `return` pelo conteúdo do `return` do template.
4. Preservar todas as linhas no topo da função (`const F`, `const tree`, etc) e a lógica de error UI.

Sequência mecânica usando Edit tool:
- Achar o `return (` da função `Dashboard` no template e copiar tudo até o `);` matching.
- Achar o `return (` no frontend e usar Edit (old_string = return completo do frontend; new_string = return completo do template, com cuidado de preservar referências a `tree`, `F`, e handlers).
- Se o template assume que o componente recebe `stats` em vez de derivar de `tree.stats`/`F`, mapear no markup novo:
  - Onde o template diz `{stats.total}`, trocar por `{(tree.stats && tree.stats.totalPeople) || Object.keys(F.people).length}`.

- [ ] **Step 3: Conferir que os hooks/refetch sobreviveram**

```bash
grep -nE 'window\.useTree|tree\.stats|tree\.status|FAMILY' \
     /srv/strips/frontend/components/dashboard.jsx
```

Esperado: pelo menos 4 hits — invocação `useTree()`, leitura de `tree.stats`, check em `tree.status`, fallback `FAMILY`.

- [ ] **Step 4: Conferir export**

```bash
grep -n 'window.Dashboard' /srv/strips/frontend/components/dashboard.jsx
```

Esperado: `window.Dashboard = Dashboard;`.

---

### Task 2.4: other-pages.jsx (149 linhas diff)

**Files:**
- Read: `template/frontend/components/other-pages.jsx`, `frontend/components/other-pages.jsx`
- Modify: `frontend/components/other-pages.jsx`

Este arquivo agrega 4 páginas: `SearchPage`, `DocumentsPage`, `PeoplePage`, `TimelinePage`. PeoplePage e TimelinePage usam `useTree` (do snapshot da árvore via API).

- [ ] **Step 1: Mapear hooks no frontend atual**

```bash
grep -nE '^function (Search|Documents|People|Timeline)Page|useTree|usePerson|window\.api' \
     /srv/strips/frontend/components/other-pages.jsx
```

Esperado: identificar exatamente quais das 4 páginas tocam em `useTree`/`useAuth`/`api`. Tipicamente PeoplePage e TimelinePage.

- [ ] **Step 2: Para cada página, escolher estratégia**

Para cada uma das 4 páginas:
- **Sem hooks** (provavelmente SearchPage/DocumentsPage) → copiar do template integralmente, substituindo a função inteira no frontend.
- **Com hooks** (provavelmente PeoplePage/TimelinePage) → manter a função do frontend e substituir só o `return ( ... )` pelo do template, adaptando referências a dados (`tree.people`, `tree.timeline`).

Processo manual usando Edit tool, uma página por vez.

- [ ] **Step 3: Validar exports**

```bash
grep -nE 'window\.(SearchPage|DocumentsPage|PeoplePage|TimelinePage)' \
     /srv/strips/frontend/components/other-pages.jsx
```

Esperado: 4 linhas, uma por página.

- [ ] **Step 4: Validar que `useTree` continua sendo chamado em PeoplePage/TimelinePage**

```bash
sed -n '/^function PeoplePage/,/^function /p' \
    /srv/strips/frontend/components/other-pages.jsx | grep -c 'useTree'

sed -n '/^function TimelinePage/,/^function /p' \
    /srv/strips/frontend/components/other-pages.jsx | grep -c 'useTree'
```

Esperado: ambos `>= 1`.

---

### Task 2.5: Smoke test + commit (Fase 2)

**Files:** nenhum, verificação.

- [ ] **Step 1: Testes automatizados**

```bash
cd /srv/strips/frontend && node --test tests/ 2>&1 | tail -10
```

Esperado: 3 suites passando.

- [ ] **Step 2: Smoke local**

```bash
cd /srv/strips/frontend && python3 -m http.server 8765 >/tmp/http.log 2>&1 &
HTTP_PID=$!
sleep 1
for f in components/mobile.jsx components/components.jsx \
         components/dashboard.jsx components/other-pages.jsx; do
  curl -sS -o /dev/null -w "$f HTTP %{http_code}\n" "http://localhost:8765/$f"
done
kill $HTTP_PID
```

Esperado: 4 linhas com `HTTP 200`.

- [ ] **Step 3: Commit**

```bash
cd /srv/strips
git add frontend/components/mobile.jsx \
        frontend/components/components.jsx \
        frontend/components/dashboard.jsx \
        frontend/components/other-pages.jsx
git status
git commit -m "$(cat <<'EOF'
chore(frontend): visual refresh fase 2 — mobile/components/dashboard/other-pages

- mobile.jsx, components.jsx: drop-in do template (sem hooks nossos).
- dashboard.jsx: substitui o return() pelo do template preservando
  useTree() + fallback FAMILY + error UI com refetch.
- other-pages.jsx: substitui o return() de cada página (Search/Documents/
  People/Timeline) preservando useTree() em PeoplePage e TimelinePage.

Política: lógica vence. Hooks/API intactos.
EOF
)"
```

---

## Phase 3 — Crítico (modais + tree + profile + app residual)

### Task 3.1: modals.jsx — 3 modais

**Files:**
- Read: `template/frontend/components/modals.jsx`, `frontend/components/modals.jsx`
- Modify: `frontend/components/modals.jsx`

Os 3 modais existem em ambos os lados, mas o template é maior — o `AddEventModal` parece ter campos novos. Estratégia: modal por modal.

- [ ] **Step 1: Mapear modais e suas dependências**

```bash
echo '=== template ==='
grep -nE '^function [A-Z][A-Za-z]+Modal' /srv/strips/template/frontend/components/modals.jsx
echo
echo '=== frontend ==='
grep -nE '^function [A-Z][A-Za-z]+Modal' /srv/strips/frontend/components/modals.jsx
echo
echo '=== handlers + API calls no frontend ==='
grep -nE 'onSave|window\.api|useAuth|useTree|usePerson' \
     /srv/strips/frontend/components/modals.jsx | head -30
```

Resultado esperado: 3 modais nos 2 lados (`EditPersonModal`, `AddEventModal`, `AddPersonModal`). Frontend deve ter alguns chamadas a handlers `onSave` (mas nem todos modais chamam API — alguns só notificam o pai).

- [ ] **Step 2: EditPersonModal — aplicar diff visual**

Ler EditPersonModal nos dois lados (linhas 184-431 no template, 141-385 no frontend). Identificar:
- Mudanças visuais (classes, layout JSX) → trazer do template.
- Handlers `onSave`, fields/state → manter os do frontend SE algum campo for diferente (mas geralmente são os mesmos).

Edit por blocos: substituir o `return (...)` ou seções específicas.

- [ ] **Step 3: AddEventModal — modal que mais cresceu**

Verificar o que cresceu (template ~289 linhas, frontend ~222 linhas). Diferença ~67 linhas — provavelmente novos campos ou novo step.

```bash
sed -n '/^function AddEventModal/,/^function /p' \
    /srv/strips/template/frontend/components/modals.jsx | head -100
sed -n '/^function AddEventModal/,/^function /p' \
    /srv/strips/frontend/components/modals.jsx | head -100
```

Estratégia:
- Se o template adicionou campos novos → trazer os campos (input + state hook + label).
- Se o template adicionou steps/wizard → trazer todo o markup do return, preservando o `onSave({...allFieldValues})` final que o pai espera.
- Se algum campo novo no template não tem handler equivalente no frontend (ex.: upload de comprovante), aceitar como display-only + abrir issue de follow-up. Anotar no commit message.

- [ ] **Step 4: AddPersonModal — final**

Similar ao Step 2: aplicar diff visual preservando o handler `onSave` que o `tree.jsx` (linha 288) já consome com `<window.AddPersonModal open={addOpen} onClose={() => setAddOpen(false)}/>`.

Nota: o frontend hoje não passa `onSave` para `AddPersonModal` (linha 288 do tree.jsx — só `open` e `onClose`). Então o modal hoje provavelmente faz a persistência internamente ou é só mock. Manter esse comportamento.

- [ ] **Step 5: Conferir exports**

```bash
grep -nE 'window\.(EditPersonModal|AddEventModal|AddPersonModal)' \
     /srv/strips/frontend/components/modals.jsx
```

Esperado: 3 linhas.

---

### Task 3.2: tree.jsx — preservar layout + integração API

**Files:**
- Read: `template/frontend/components/tree.jsx`, `frontend/components/tree.jsx`
- Modify: `frontend/components/tree.jsx`

Lógica crítica a preservar (linhas atuais no frontend):
- Linhas ~140-163: `useTree()`, `apiCanRender`, `apiLayout`, `mockLayout`, `peopleById`, `focusId` derivados da API
- Linhas 195-220: handlers de zoom/pan
- `window.treeLayout.computeApiTreeLayout(tree.people, tree.unions, tree.relationsByChild)` — chamada que conecta ao algoritmo de layout

- [ ] **Step 1: Mapear diff em tree.jsx**

```bash
diff -u /srv/strips/frontend/components/tree.jsx \
        /srv/strips/template/frontend/components/tree.jsx | head -200
```

- [ ] **Step 2: Estratégia**

Não copiar o arquivo inteiro. Identificar mudanças visuais (TreeNode, HoverCard, zoom controls, legend) e aplicar só essas via Edit por componente:

- `TreeNode` (frontend linhas ~111-138) → trazer do template (linhas equivalentes).
- `HoverCard` (frontend linhas ~397-408) → trazer do template.
- Bloco JSX `tree-toolbar` (linhas ~280-290) e `zoom-ctrl/tree-legend` (linhas ~370-385) → trazer do template.
- Preservar:
  - Toda a lógica de hooks/state no topo de `FamilyTree` (linhas ~140-170 do frontend).
  - `mockLayout`/`apiLayout`/`peopleById`/`focusId` (linhas ~143-163).
  - Loops de render dos nodes e links (linhas ~327-367) — o markup interno do node muda, mas o loop em si pode ficar.

- [ ] **Step 3: Verificar que a chamada ao layout sobreviveu**

```bash
grep -n 'computeApiTreeLayout\|window\.treeLayout' \
     /srv/strips/frontend/components/tree.jsx
```

Esperado: pelo menos uma chamada `window.treeLayout.computeApiTreeLayout(tree.people, tree.unions, tree.relationsByChild)`.

- [ ] **Step 4: Verificar que `apiCanRender` sobreviveu**

```bash
grep -n 'apiCanRender\|apiLayout\|mockLayout\|peopleById' \
     /srv/strips/frontend/components/tree.jsx
```

Esperado: pelo menos 4 hits — todos esses símbolos continuam sendo computados e usados.

- [ ] **Step 5: Verificar export**

```bash
grep -n 'window.FamilyTree' /srv/strips/frontend/components/tree.jsx
```

Esperado: `window.FamilyTree = FamilyTree;`.

- [ ] **Step 6: Smoke específico — layout test continua passando**

```bash
cd /srv/strips/frontend && node --test tests/tree-layout.test.js 2>&1 | tail -5
```

Esperado: passing. Este teste exercita o `computeApiTreeLayout` em `scripts/tree-layout.js` — não deve ser afetado, mas confirmar.

---

### Task 3.3: profile.jsx — preservar usePerson

**Files:**
- Read: `template/frontend/components/profile.jsx`, `frontend/components/profile.jsx`
- Modify: `frontend/components/profile.jsx`

Lógica crítica:
- `usePerson(personId)` retorna `{ status, person, relations, error }`
- Estados: `idle/loading/ready/empty/error/fallback/unavailable`
- Cada estado tem UI diferente — preservar a discriminação

- [ ] **Step 1: Mapear hooks no frontend**

```bash
grep -nE 'usePerson|status === ["\047]' /srv/strips/frontend/components/profile.jsx | head
```

Esperado: chamada de `usePerson(...)` e vários `if (status === "...")` ou ternários discriminando estados.

- [ ] **Step 2: Estratégia**

Manter toda a estrutura de hooks e discriminação de estado. Substituir markup interno (cabeçalho, bio, seção de relações, eventos) pela versão do template.

- [ ] **Step 3: Verificar hooks**

```bash
grep -nE 'usePerson|person.first|person.last|relations.parents|relations.partners|relations.children|relations.siblings' \
     /srv/strips/frontend/components/profile.jsx | head -10
```

Esperado: presence de chamada `usePerson` + acesso a campos do `person` + acesso a `relations.{parents,partners,siblings,children}`.

- [ ] **Step 4: Verificar export**

```bash
grep -n 'window.Profile' /srv/strips/frontend/components/profile.jsx
```

Esperado: `window.Profile = Profile;`.

---

### Task 3.4: app.jsx — passagem residual

**Files:**
- Read: `template/frontend/components/app.jsx`, `frontend/components/app.jsx`
- Modify: `frontend/components/app.jsx`

Já mexido na Fase 1 (rota settings). Resta: aplicar quaisquer ajustes visuais residuais (provavelmente classes em wrappers, breadcrumbs, etc) **preservando o auth gate**.

- [ ] **Step 1: Diff atualizado vs template**

```bash
diff -u /srv/strips/frontend/components/app.jsx \
        /srv/strips/template/frontend/components/app.jsx | head -100
```

Identificar diferenças que **não são** o auth/useTree/lookupPersonName/route settings (essas devem ficar). Diferenças visuais (classes em wrappers, ordem de elementos no TopBar) são candidatas para aplicação.

- [ ] **Step 2: Aplicar só ajustes visuais residuais**

Edit pontual. Se não houver nada relevante (provável — o template é menor porque não tem auth gate), pular para o Step 3.

- [ ] **Step 3: Confirmar que o auth gate sobreviveu**

```bash
grep -nE 'auth\.status === "loading"|auth\.status === "misconfigured"|AuthLoading|AuthScreen' \
     /srv/strips/frontend/components/app.jsx
```

Esperado: pelo menos 4 hits — todos os checks do auth gate continuam.

- [ ] **Step 4: Confirmar que `useTree` sobreviveu**

```bash
grep -nE 'window\.useTree|tree\.peopleById|lookupPersonName' \
     /srv/strips/frontend/components/app.jsx
```

Esperado: pelo menos 3 hits.

---

### Task 3.5: Smoke test final + commit (Fase 3)

**Files:** nenhum, verificação.

- [ ] **Step 1: Rodar testes**

```bash
cd /srv/strips/frontend && node --test tests/ 2>&1 | tail -10
```

Esperado: 3 suites passando, 0 falhas.

- [ ] **Step 2: Smoke local — todas as páginas carregam**

```bash
cd /srv/strips/frontend && python3 -m http.server 8765 >/tmp/http.log 2>&1 &
HTTP_PID=$!
sleep 1
for f in Stirps.html \
         stylesheets/styles.css \
         scripts/config.js scripts/auth.js scripts/api.js scripts/adapters.js \
         scripts/tree-layout.js scripts/tree-data.js scripts/data.js \
         components/ios-frame.jsx components/tweaks-panel.jsx \
         components/components.jsx components/dashboard.jsx \
         components/tree.jsx components/profile.jsx components/modals.jsx \
         components/other-pages.jsx components/mobile.jsx \
         components/auth-screen.jsx components/settings.jsx \
         components/app.jsx; do
  curl -sS -o /dev/null -w "$f HTTP %{http_code}\n" "http://localhost:8765/$f"
done
kill $HTTP_PID
```

Esperado: 21 linhas, todas com `HTTP 200`.

- [ ] **Step 3: Commit Fase 3**

```bash
cd /srv/strips
git add frontend/components/modals.jsx \
        frontend/components/tree.jsx \
        frontend/components/profile.jsx \
        frontend/components/app.jsx
git status
git commit -m "$(cat <<'EOF'
chore(frontend): visual refresh fase 3 — modals/tree/profile/app residual

- modals.jsx: refresh visual nos 3 modais (Edit/AddEvent/AddPerson)
  preservando handlers onSave. Campos novos em AddEventModal entram
  como display-only se não tiverem persistência (anotar follow-up).
- tree.jsx: substitui TreeNode/HoverCard/zoom/legend pela versão do
  template, preservando apiCanRender/apiLayout/peopleById/focusId e
  a chamada a window.treeLayout.computeApiTreeLayout.
- profile.jsx: substitui markup das seções (cabeçalho/bio/relações)
  preservando usePerson(personId) e a discriminação de status.
- app.jsx: ajustes visuais residuais. Auth gate + useTree + rota
  settings (da fase 1) mantidos.

Política: lógica vence. Hooks/API intactos.
EOF
)"
```

- [ ] **Step 4: Inspeção final da branch**

```bash
cd /srv/strips
git log --oneline main..HEAD
git diff main..HEAD --stat
```

Esperado: 4 commits desde o `efd118b` (spec) — 1 spec + 3 chore commits, totalizando ~15 arquivos modificados.

---

## Phase 4 — Merge + Deploy

### Task 4.1: PR + revisão visual em produção

- [ ] **Step 1: Push e abrir PR**

```bash
cd /srv/strips
git push -u origin chore/visual-refresh-from-template
gh pr create --title "chore(frontend): visual refresh from designer template" \
  --body "$(cat <<'EOF'
## Resumo

Aplica o refresh visual e a página Settings do mockup do designer (em `template/`)
ao frontend ativo, em 3 fases (3 commits).

## Mudanças

- **Fase 1** — CSS novo + `settings.jsx` (drop-in) + rota settings real em `app.jsx`.
- **Fase 2** — refresh visual em `mobile.jsx`, `components.jsx`, `dashboard.jsx`, `other-pages.jsx`. Preservou `useTree` em Dashboard, People, Timeline.
- **Fase 3** — refresh visual em `modals.jsx`, `tree.jsx`, `profile.jsx`, e ajustes residuais em `app.jsx`. Preservou `useAuth`, `useTree`, `usePerson`, `computeApiTreeLayout`.

## Test plan
- [x] `node --test tests/` passando após cada commit
- [x] Smoke local: todos os assets retornam 200
- [ ] Após deploy: login funciona, árvore carrega, Settings renderiza, demais páginas estilizadas
- [ ] Após deploy: `curl /api/me` continua respondendo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Após merge na main, redeploy pelo EasyPanel**

(Manual — o usuário deve disparar o redeploy do serviço `strips/web` no EasyPanel, igual ao último.)

- [ ] **Step 3: Validação em produção**

```bash
# 1. Container novo subiu?
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep strips_web
# 2. GIT_SHA bate com main?
WEB=$(docker ps --filter 'name=strips_web' --format '{{.Names}}' | head -1)
docker exec "$WEB" env | grep GIT_SHA
# 3. config.js continua ok?
curl -sS https://strips.cassiorodrigues.tech/scripts/config.js | grep -E 'apiBaseUrl|supabaseUrl|supabaseAnonKey'
# 4. settings.jsx serve?
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://strips.cassiorodrigues.tech/components/settings.jsx
# 5. /api/me ainda responde
TOKEN=$(cat /tmp/token.txt 2>/dev/null | tr -d '\n')
[ -n "$TOKEN" ] && curl -sS -o /dev/null -w '/api/me HTTP %{http_code}\n' \
     -H "Authorization: Bearer $TOKEN" https://strips.cassiorodrigues.tech/api/me
```

Esperado:
- container `strips_web` Up < 2 min
- GIT_SHA bate com o `git rev-parse HEAD` na main
- config.js com 3 valores preenchidos
- `/components/settings.jsx` HTTP 200
- `/api/me` HTTP 200 (se token ainda válido) ou 401 (token expirou)

- [ ] **Step 4: Smoke manual via navegador**

Em ordem:
1. Abrir `https://strips.cassiorodrigues.tech` em janela anônima
2. Logar com `cassiorodrigues@live.com / 43610581`
3. Conferir Dashboard → estilizado, números aparecem
4. Conferir Árvore → renderiza (com bug do layout #32, é esperado)
5. Conferir Pessoas, Linha do tempo, Pesquisa, Documentos
6. Clicar em uma pessoa → Profile abre, dados aparecem
7. Cmd+K → CommandPalette abre
8. Sidebar → **Configurações** → SettingsPage renderiza
9. Mobile companion → renderiza
10. Logout → volta pra tela de login estilizada

Qualquer regressão detectada: criar issue separada referenciando o PR. Se for bloqueante, reverter o commit da fase problemática (`git revert <sha>`).
