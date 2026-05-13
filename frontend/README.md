# frontend/

Frontend ativo do Stirps. Mockup React puro, **sem build step**: React, ReactDOM
e Babel standalone são carregados via CDN (UMD com SRI) e os componentes JSX
ficam em `components/*.jsx`, transpilados no browser pelo Babel. Os exports
acontecem todos via globais (`window.*`).

O entry point é `Stirps.html`. Em produção é servido estaticamente — ou pelo
nginx do host (`/etc/nginx/sites-available/cassiorodrigues.tech` → `/strips/`),
ou pelo container Docker definido aqui (`Dockerfile` + `nginx.conf`), inclusive
via EasyPanel.

## Runtime config — `window.STIRPS_CONFIG`

Componentes **não devem hardcodar** URL de API, URL do Supabase ou chave anon.
Tudo isso vive em `window.STIRPS_CONFIG`, carregado pelo `scripts/config.js`
**antes** dos demais scripts em `Stirps.html`:

```js
window.STIRPS_CONFIG = {
  apiBaseUrl: "http://localhost:8001/api",
  supabaseUrl: "",
  supabaseAnonKey: ""
};
```

Campos:

| Chave              | Tipo   | Conteúdo                                                     |
|--------------------|--------|--------------------------------------------------------------|
| `apiBaseUrl`       | string | URL base da API Stirps (FastAPI). Pode ser absoluta ou relativa. |
| `supabaseUrl`      | string | URL pública do projeto Supabase.                             |
| `supabaseAnonKey`  | string | Chave **anon** (publishable) do Supabase.                    |

> AVISO DE SEGURANÇA: este arquivo é servido publicamente. Nunca coloque aqui
> a `service_role` do Supabase, nem qualquer outra credencial privada. Só
> entram valores que já seriam visíveis no browser de qualquer usuário.

### Local dev

O default committado em `scripts/config.js` aponta para
`http://localhost:8001/api` (a porta do `strips-api.service` local) com
Supabase vazio — suficiente para mexer no mockup. Basta abrir
`Stirps.html` no browser, ou servir a pasta com:

```bash
cd frontend
python3 -m http.server 8000
# acesse http://localhost:8000/Stirps.html
```

Se você precisar de valores diferentes durante o desenvolvimento, edite
`scripts/config.js` localmente — só não commite a edição.

### Produção via nginx do host (servidor `cassiorodrigues.tech`)

O nginx do host serve `/srv/strips/frontend/` diretamente em `/strips/`. Para
alterar a config em produção sem rebuild:

1. Edite `/srv/strips/frontend/scripts/config.js` no servidor (ou faça o deploy
   da pasta com a versão correta do arquivo).
2. Não é preciso reload do nginx — os browsers vão pegar a nova versão na
   próxima requisição (o `Cache-Control` configurado é `public` com `expires
   1h`; force-refresh ou aguarde a expiração).

### Produção via Docker / EasyPanel

O `Dockerfile` deste diretório usa um entrypoint
(`docker-entrypoint.sh` → `/docker-entrypoint-stirps.sh` na imagem) que, **no
boot do container**, expande um template em
`/etc/strips/config.js.template` via `envsubst` e grava o resultado em
`/usr/share/nginx/html/scripts/config.js`, sobrescrevendo o default
committado. Em seguida faz `exec nginx -g 'daemon off;'`, mantendo o nginx
como PID 1.

As variáveis de ambiente esperadas são:

| Variável                      | Default se ausente | Significado                              |
|-------------------------------|--------------------|------------------------------------------|
| `STIRPS_API_BASE_URL`         | `/strips/api`      | Vira `window.STIRPS_CONFIG.apiBaseUrl`.  |
| `STIRPS_SUPABASE_URL`         | `""`               | Vira `window.STIRPS_CONFIG.supabaseUrl`. |
| `STIRPS_SUPABASE_ANON_KEY`    | `""`               | Vira `window.STIRPS_CONFIG.supabaseAnonKey`. |

> `envsubst` é invocado com a lista explícita destes três placeholders, então
> qualquer outro `$...` que apareça no arquivo (hoje não há nenhum) passa
> intacto.

Exemplo de configuração no EasyPanel (aba **Environment** do serviço do
frontend):

```env
STIRPS_API_BASE_URL=https://cassiorodrigues.tech/strips/api
STIRPS_SUPABASE_URL=https://abcd1234.supabase.co
STIRPS_SUPABASE_ANON_KEY=eyJhbGciOiJFUzI1NiIs...   # anon key pública, NUNCA service_role
```

Para validar localmente (substituindo no template e abrindo a saída):

```bash
cd /srv/strips/frontend
STIRPS_API_BASE_URL=https://api.example.com/api \
STIRPS_SUPABASE_URL=https://abcd1234.supabase.co \
STIRPS_SUPABASE_ANON_KEY=anon-key-aqui \
envsubst '${STIRPS_API_BASE_URL} ${STIRPS_SUPABASE_URL} ${STIRPS_SUPABASE_ANON_KEY}' \
  < config.js.template
```

Para subir o container manualmente com overrides:

```bash
cd /srv/strips
docker build -t stirps-frontend ./frontend
docker run --rm -p 8080:80 \
  -e STIRPS_API_BASE_URL=https://cassiorodrigues.tech/strips/api \
  -e STIRPS_SUPABASE_URL=https://abcd1234.supabase.co \
  -e STIRPS_SUPABASE_ANON_KEY=eyJhbGciOiJFUzI1NiIs... \
  stirps-frontend
# acesse http://127.0.0.1:8080/scripts/config.js para conferir o resultado
```

## Estrutura

```
frontend/
├── Stirps.html              entry point (carrega config.js → React → JSX)
├── scripts/
│   ├── config.js            runtime config (default dev, committado)
│   └── data.js              FAMILY mockada (será trocada pela API depois)
├── components/              JSX (app, tree, profile, dashboard, modals, ...)
├── stylesheets/             CSS
├── config.js.template       fonte para envsubst no boot do container
├── docker-entrypoint.sh     renderiza config.js e dá exec no nginx
├── Dockerfile               nginx:1.27-alpine + entrypoint
└── nginx.conf               serve Stirps.html como index
```
