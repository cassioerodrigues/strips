# deploy/

Artefatos versionados para subir a API Stirps em produção. Os arquivos aqui
**não** são lidos diretamente pelo sistema — eles são a fonte da verdade, e
precisam ser copiados para os diretórios de sistema correspondentes.

## Arquivos

- `strips-api.service` — unit do systemd que roda o `uvicorn` em
  `127.0.0.1:8001` como `www-data`, lendo `/srv/strips/backend/.env`.
- `nginx-strips-api.conf` — trecho (`location /strips/api/ { ... }`) que precisa
  ser **inserido dentro** do `server { ... }` existente em
  `/etc/nginx/sites-available/cassiorodrigues.tech`. Não é um site standalone.

## Instalação inicial

```bash
# systemd
cp /srv/strips/deploy/strips-api.service /etc/systemd/system/strips-api.service
systemctl daemon-reload
systemctl enable --now strips-api

# nginx — inserir o location à mão (snippet em nginx-strips-api.conf)
nginx -t && systemctl reload nginx
```

## Re-deploy após editar código

```bash
systemctl restart strips-api
```

## Re-deploy após editar o unit

```bash
cp /srv/strips/deploy/strips-api.service /etc/systemd/system/strips-api.service
systemctl daemon-reload
systemctl restart strips-api
```

## Re-deploy após editar o nginx

Editar `/etc/nginx/sites-available/cassiorodrigues.tech` manualmente
(refletindo o snippet em `nginx-strips-api.conf`), e:

```bash
nginx -t && systemctl reload nginx
```

## URL pública

A API fica em `https://cassiorodrigues.tech/strips/api/`. O nginx faz
proxy para `127.0.0.1:8001/api/` (o prefixo `/strips/api/` é reescrito
para `/api/` antes de chegar no FastAPI).

Healthcheck: `https://cassiorodrigues.tech/strips/api/healthz`.

## TLS

Os certificados foram emitidos pelo Let's Encrypt via `certbot --nginx`
para `cassiorodrigues.tech`, `www.cassiorodrigues.tech` e
`easypanel.cassiorodrigues.tech`. A renovação é automática
(`certbot.timer`). O redirect HTTP→HTTPS já está configurado pelo certbot
no próprio `sites-available/cassiorodrigues.tech`.
