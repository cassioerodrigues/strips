# Migrar para Supabase real (ES256 + JWKS) — Design

**Data:** 2026-05-11
**Fecha:** Issues #21 (JWT HS256 → ES256/JWKS) e parte de #12 (aplicar trigger em prod)
**Escopo:** Backend apenas. Frontend (Issue #18) fora.

## Contexto

O projeto Supabase em `onbjspsksvpmhtpbicio.supabase.co` já existe com schema
completo (12 tabelas, 8 enums, RLS habilitado, 26 policies em `public.*`, bucket
privado `stirps-media` com 4 policies em `storage.objects`). Faltam dois itens:

1. Migration `0009_profiles_trigger.sql` (já commitada na main em c78d190) não
   está aplicada na DB.
2. O backend valida JWT como **HS256** com `SUPABASE_JWT_SECRET`. O projeto
   Supabase Cloud novo emite tokens **ES256** via chaves assimétricas
   publicadas em `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Sem trocar o
   validador, nenhum token real é aceito — o `.env` de prod já reconhece isso
   com um placeholder `placeholder-will-be-replaced-when-issue-21-is-resolved`.

A DB está vazia (`auth.users`, `profiles`, `trees` = 0 linhas) — clean slate,
sem migração de dados a fazer.

## Decisão

Implementar Issue #21 (ES256 + JWKS) **antes** de validar o backend contra o
Supabase real. Corte limpo, sem fallback HS256.

## Mudanças no código

### `backend/app/auth.py`

Substituir `decode_jwt(token, secret)` por `decode_jwt(token, jwks_url)`.

```python
import jwt
from jwt import PyJWKClient

_jwk_client: PyJWKClient | None = None

def _get_jwk_client(jwks_url: str) -> PyJWKClient:
    """JWKS client cacheado por processo. Refetch automático em kid-miss
    (lida com rotação de chave) e TTL de 1h como fallback."""
    global _jwk_client
    if _jwk_client is None or _jwk_client.uri != jwks_url:
        _jwk_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwk_client


def decode_jwt(token: str, jwks_url: str) -> Claims:
    """Valida JWT ES256 do Supabase via JWKS pública."""
    client = _get_jwk_client(jwks_url)
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.PyJWKClientError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Cannot verify token: {exc}")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}")
    # … sub UUID + Claims igual ao atual
```

Por que `PyJWKClient`:
- Cache em-memória embutido.
- Refetch automático quando o JWT traz um `kid` que não está no cache.
- TTL de 1h (`lifespan=3600`) garante refresh oportunista mesmo sem kid-miss.
- Single-process — em prod rodamos 1 worker uvicorn; se evoluir para múltiplos
  workers, cada um terá seu cache (aceitável: alvo é ~1 fetch/h/worker).

### `backend/app/config.py`

- Remover campo `supabase_jwt_secret`.
- Adicionar `@property supabase_jwks_url` que deriva de `supabase_url`:
  `f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"`.

### `backend/app/deps.py:29`

- `decode_jwt(token, settings.supabase_jwt_secret)` → `decode_jwt(token, settings.supabase_jwks_url)`.
- Mensagem de erro "SUPABASE_JWT_SECRET not configured" vira
  "SUPABASE_URL not configured" (a checagem é em `settings.supabase_url`).

### `backend/.env.example`

Remover `SUPABASE_JWT_SECRET=...`. Comentário curto:

```ini
# Auth: validação ES256 via JWKS pública em {SUPABASE_URL}/auth/v1/.well-known/jwks.json
# Não precisa de secret simétrico desde a migração para Supabase Cloud com chaves assimétricas.
```

### `backend/.env` de prod (no servidor)

Remover a linha `SUPABASE_JWT_SECRET=placeholder-...`. **Não vou tocar o
arquivo do servidor diretamente** — vai num passo de ops separado, após o
deploy do código.

## Testes

`backend/tests/conftest.py`:

1. **Keypair EC P-256 fixo de teste** no topo do módulo:
   ```python
   from cryptography.hazmat.primitives.asymmetric import ec

   _TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())  # gerado em import
   _TEST_PUBLIC_KEY = _TEST_PRIVATE_KEY.public_key()
   _TEST_KID = "test-kid"
   ```
   Geração em import-time produz um keypair único por processo (não
   determinístico entre runs, mas estável dentro da suite), suficiente.

2. **Fixture autouse** (perto de `_patch_settings_for_tests`) que monkeypatcha
   `PyJWKClient.get_signing_key_from_jwt` para retornar uma key falsa cuja
   `.key` é `_TEST_PUBLIC_KEY`. Isso evita rede e mantém `auth.py` sem
   injeção de dependência só pra teste.

3. **`make_user`** passa a assinar com `_TEST_PRIVATE_KEY`, `algorithm="ES256"`,
   header `{"kid": _TEST_KID}`. Resto da claim igual.

4. **Gates de skip** — `SUPABASE_JWT_SECRET` some das condições. Trocar:
   ```python
   pytestmark = pytest.mark.skipif(
       not os.getenv("TEST_DATABASE_URL") or not os.getenv("SUPABASE_JWT_SECRET"),
       reason="...",
   )
   ```
   por:
   ```python
   pytestmark = pytest.mark.skipif(
       not os.getenv("TEST_DATABASE_URL"),
       reason="TEST_DATABASE_URL necessário para testes integrados",
   )
   ```
   Mesma troca em `conftest.py` (`_DB_AVAILABLE`), `test_auth.py`,
   `test_people.py`, `test_media.py`, `test_rls.py`, `test_unions.py`.

5. **Dependência cryptography:** PyJWT já depende de `cryptography` via
   `PyJWT[crypto]`, então é transitiva — não precisa adicionar em
   `pyproject.toml`.

## Aplicar no Supabase Cloud

Após o backend estar verde:

```bash
cd /srv/strips/backend
set -a && . ./.env && set +a
psql "$DATABASE_URL" -f db/migrations/0009_profiles_trigger.sql
```

Aceite: `\df handle_new_user` mostra a função; `select tgname from pg_trigger
where tgrelid='auth.users'::regclass` inclui `on_auth_user_created`.

## Smoke test end-to-end

1. Pegar `SUPABASE_ANON_KEY` no dashboard (Project Settings → API → "anon
   public"). Não precisa salvar em `.env` do backend — só uso para o smoke.

2. Signup via REST do Supabase Auth:
   ```bash
   curl -X POST "$SUPABASE_URL/auth/v1/signup" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"smoke@test.local","password":"smoke-test-1234","data":{"display_name":"Smoke Test"}}'
   ```
   Captura `access_token` da resposta.

3. Chamada na API:
   ```bash
   curl -i http://127.0.0.1:8001/api/me \
     -H "Authorization: Bearer <access_token>"
   ```
   Aceite: HTTP 200, body com `profile.display_name == "Smoke Test"`,
   `trees == []`.

4. Limpeza:
   ```bash
   psql "$DATABASE_URL" -c "DELETE FROM auth.users WHERE email = 'smoke@test.local';"
   ```

## Closure

- Issue #21 → comentar resumo, mover para Done, fechar.
- Issue #12 já está fechada; comentar atualização confirmando trigger aplicada
  em prod.
- Um commit referenciando #21 + push.

## Fora de escopo

- Frontend (`@supabase/supabase-js`, signup UI, API client) — fica para Issue
  #18.
- Reiniciar `strips-api.service` no servidor após atualizar `.env` de prod —
  passo de ops, não está neste design.
- Rotação das credenciais que apareceram no transcript — recomendação ao
  usuário, mas execução fica com ele.
- Deletar `SUPABASE_JWT_SECRET=...` do `.env` que está no servidor — vai com a
  mesma ondinha de deploy.

## Riscos

- **JWKS endpoint indisponível:** `PyJWKClient` levanta `PyJWKClientError` →
  mapeamos para 401. Aceitável; se Supabase Auth cair, o backend também não
  consegue autenticar nada (correto).
- **Mudança quebrante:** `decode_jwt(token, secret)` → `decode_jwt(token,
  jwks_url)` muda assinatura pública. Único caller é `deps.py`. Sem
  consumidores externos.
- **Tokens HS256 antigos:** clean slate, não há. Se aparecesse, falharia com
  401 "Cannot verify token" (correto).
