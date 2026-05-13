#!/bin/sh
# Renderiza /usr/share/nginx/html/scripts/config.js a partir do template
# /etc/strips/config.js.template no boot do container, expandindo APENAS
# as três variáveis públicas conhecidas. Depois faz exec do nginx para
# manter o PID 1.
set -eu

TEMPLATE="/etc/strips/config.js.template"
TARGET="/usr/share/nginx/html/scripts/config.js"

# Defaults seguros caso alguma env var não esteja definida.
# - apiBaseUrl cai no path relativo do backend no domínio raiz do app.
# - supabaseUrl/anonKey ficam vazios — frontend trata como "não configurado".
: "${STIRPS_API_BASE_URL:=/api}"
: "${STIRPS_SUPABASE_URL:=}"
: "${STIRPS_SUPABASE_ANON_KEY:=}"
export STIRPS_API_BASE_URL STIRPS_SUPABASE_URL STIRPS_SUPABASE_ANON_KEY

if [ -f "$TEMPLATE" ]; then
  # Lista explícita de variáveis: envsubst só toca nestes três placeholders,
  # qualquer outro "$..." no arquivo passa intacto. Escreve em .tmp + mv para
  # evitar que o nginx pegue um arquivo parcialmente escrito.
  envsubst '${STIRPS_API_BASE_URL} ${STIRPS_SUPABASE_URL} ${STIRPS_SUPABASE_ANON_KEY}' \
    < "$TEMPLATE" > "$TARGET.tmp"
  mv "$TARGET.tmp" "$TARGET"
  echo "[entrypoint] runtime config escrita em $TARGET"
else
  echo "stirps-entrypoint: template not found at $TEMPLATE" >&2
  exit 1
fi

exec nginx -g 'daemon off;'
