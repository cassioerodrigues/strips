# Migrar para Supabase real (ES256 + JWKS) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a validação de JWT no backend de HS256 (segredo simétrico) para ES256 via JWKS pública do Supabase Cloud, aplicar a migration 0009 (trigger `handle_new_user`) em prod, e validar o fluxo end-to-end com um signup real.

**Architecture:** `app/auth.py` passa a usar `jwt.PyJWKClient` (PyJWT já tem) que faz fetch/cache/refresh de JWKS por kid-miss. `Settings.supabase_jwks_url` é derivado de `supabase_url`. Testes geram pares EC P-256 em-processo e monkeypatcham `PyJWKClient.get_signing_key_from_jwt` para evitar rede.

**Tech Stack:** Python 3.10+, FastAPI 0.115+, PyJWT[crypto] (já instalado), psycopg v3, pytest+anyio, cryptography (transitivo via PyJWT[crypto]).

**Spec:** `docs/superpowers/specs/2026-05-11-supabase-real-es256-jwks-design.md`.

---

## File Structure

**Modificados (backend):**
- `backend/app/auth.py` — assinatura `decode_jwt(token, jwks_url)`, validação ES256 via `PyJWKClient`.
- `backend/app/config.py` — remove `supabase_jwt_secret`, adiciona property `supabase_jwks_url`.
- `backend/app/deps.py` — passa `settings.supabase_jwks_url` para `decode_jwt`; mensagem de erro atualizada.
- `backend/.env.example` — remove `SUPABASE_JWT_SECRET`, adiciona comentário sobre JWKS.

**Modificados (testes):**
- `backend/tests/conftest.py` — keypair EC de teste, fixture autouse que monkeypatcha `PyJWKClient`, `make_user` assina ES256.
- `backend/tests/test_auth.py` — skip gate sem `SUPABASE_JWT_SECRET`; `test_me_with_invalid_jwt_returns_401` e `test_profile_autocreated_on_signup` assinam ES256 com o keypair de teste.
- `backend/tests/test_people.py`, `test_media.py`, `test_rls.py`, `test_unions.py` — skip gates sem `SUPABASE_JWT_SECRET`.

**Criados:**
- `backend/tests/test_auth_decode.py` — unit tests do `decode_jwt` (sem DB).

**Nada toca:** `app/main.py`, `app/db.py`, `app/storage.py`, schemas, routers, services, migrations existentes. Storage continua usando `supabase_service_role_key`.

---

### Task 1: Unit tests do `decode_jwt` — failing tests primeiro

**Files:**
- Create: `backend/tests/test_auth_decode.py`

- [ ] **Step 1: Escrever o teste falhando**

Criar `backend/tests/test_auth_decode.py`:

```python
"""Unit tests do decode_jwt — não dependem de DB nem rede.

Geramos um keypair EC P-256 in-process, assinamos tokens ES256 e monkeypatchamos
PyJWKClient.get_signing_key_from_jwt para devolver a chave pública correspondente.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.auth import Claims, decode_jwt


# Keypair único do módulo de teste.
_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()
_KID = "unit-test-kid"
_JWKS_URL = "https://example.test/auth/v1/.well-known/jwks.json"


class _FakeSigningKey:
    """Imita o objeto que PyJWKClient.get_signing_key_from_jwt() devolve."""
    def __init__(self, key):
        self.key = key


@pytest.fixture(autouse=True)
def _patch_jwk_client(monkeypatch):
    """Substitui o fetch JWKS de rede por um mock que sempre devolve a
    chave pública de teste."""
    def fake_get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(_PUBLIC_KEY)

    monkeypatch.setattr(
        "jwt.PyJWKClient.get_signing_key_from_jwt",
        fake_get_signing_key_from_jwt,
    )
    # Limpar o cache de cliente global entre testes.
    import app.auth
    app.auth._jwk_client = None


def _make_token(claims: dict, kid: str = _KID, private_key=None) -> str:
    return jwt.encode(
        claims,
        private_key or _PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": kid},
    )


def test_decode_jwt_returns_claims_for_valid_es256_token():
    sub = uuid.uuid4()
    token = _make_token({
        "sub": str(sub),
        "email": "alice@test.local",
        "role": "authenticated",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    claims = decode_jwt(token, _JWKS_URL)
    assert isinstance(claims, Claims)
    assert claims.sub == sub
    assert claims.email == "alice@test.local"
    assert claims.role == "authenticated"


def test_decode_jwt_raises_401_for_expired_token():
    token = _make_token({
        "sub": str(uuid.uuid4()),
        "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()


def test_decode_jwt_raises_401_for_bad_signature():
    # Assina com OUTRA chave privada — a pública mockada não vai bater.
    other_key = ec.generate_private_key(ec.SECP256R1())
    token = _make_token(
        {"sub": str(uuid.uuid4()),
         "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())},
        private_key=other_key,
    )
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401


def test_decode_jwt_raises_401_for_missing_sub():
    token = _make_token({
        "email": "x@y.z",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
    assert "sub" in exc.value.detail.lower()


def test_decode_jwt_raises_401_for_invalid_sub_uuid():
    token = _make_token({
        "sub": "not-a-uuid",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    })
    with pytest.raises(HTTPException) as exc:
        decode_jwt(token, _JWKS_URL)
    assert exc.value.status_code == 401
```

- [ ] **Step 2: Rodar pra confirmar que falha**

```bash
cd /srv/strips/backend && .venv/bin/pytest tests/test_auth_decode.py -v
```

Esperado: 5 falhas. Mensagens variam, mas o `decode_jwt` atual aceita só `algorithms=["HS256"]`, então `test_decode_jwt_returns_claims_for_valid_es256_token` falha com `InvalidAlgorithmError` ou similar.

- [ ] **Step 3: Implementar `decode_jwt` ES256+JWKS**

Substituir todo o conteúdo de `backend/app/auth.py`:

```python
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient, PyJWKClientError


@dataclass(frozen=True)
class Claims:
    sub: UUID
    email: str | None
    role: str


# Cache de PyJWKClient por processo. PyJWKClient já mantém um cache interno
# de chaves (com refetch automático em kid-miss e TTL); aqui só guardamos a
# instância para reusar entre requisições.
_jwk_client: PyJWKClient | None = None


def _get_jwk_client(jwks_url: str) -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None or _jwk_client.uri != jwks_url:
        _jwk_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwk_client


def decode_jwt(token: str, jwks_url: str) -> Claims:
    """Valida um JWT do Supabase (ES256) usando a JWKS pública.

    O Supabase Cloud emite tokens ES256 assinados com chaves rotativas; a
    chave pública correspondente está em
    `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Selecionamos a chave
    pelo header `kid` do token. Verificamos assinatura + exp; não
    verificamos `aud` (Supabase põe "authenticated" lá mas não traz
    garantia extra de segurança no nosso caso).
    """
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
    except PyJWKClientError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Cannot verify token: {exc}")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub claim")
    try:
        sub_uuid = UUID(sub)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid sub claim")

    return Claims(
        sub=sub_uuid,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )
```

- [ ] **Step 4: Rodar pra confirmar que passa**

```bash
cd /srv/strips/backend && .venv/bin/pytest tests/test_auth_decode.py -v
```

Esperado: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /srv/strips
git add backend/app/auth.py backend/tests/test_auth_decode.py
git commit -m "feat(auth): valida JWT ES256 via JWKS (Issue #21)

decode_jwt agora recebe a URL do JWKS público do Supabase em vez do
segredo HS256 e usa PyJWKClient (cache + refetch on kid-miss) para
buscar a chave pública correspondente ao kid do token.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Settings — remover `supabase_jwt_secret`, adicionar `supabase_jwks_url`

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Substituir `Settings`**

Editar `backend/app/config.py`. Trocar a classe inteira por:

```python
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "stirps-media"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:8000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def supabase_jwks_url(self) -> str:
        """URL do JWKS pública do Supabase Auth, derivada de supabase_url."""
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 2: Rodar pra garantir que o módulo carrega**

```bash
cd /srv/strips/backend && .venv/bin/python -c "from app.config import get_settings; s = get_settings(); print(s.supabase_jwks_url)"
```

Esperado: imprime `/auth/v1/.well-known/jwks.json` (com `supabase_url` vazio).
Se `supabase_url` estiver no `.env`, imprime a URL completa.

- [ ] **Step 3: Commit**

```bash
cd /srv/strips
git add backend/app/config.py
git commit -m "feat(config): substituir supabase_jwt_secret por supabase_jwks_url derivada

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: `deps.py` — usar `supabase_jwks_url`

**Files:**
- Modify: `backend/app/deps.py:23-29`

- [ ] **Step 1: Editar o bloco que monta o decode**

Trocar:

```python
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_JWT_SECRET not configured",
        )
    return decode_jwt(token, settings.supabase_jwt_secret)
```

Por:

```python
    settings = get_settings()
    if not settings.supabase_url:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_URL not configured",
        )
    return decode_jwt(token, settings.supabase_jwks_url)
```

- [ ] **Step 2: Smoke check de import**

```bash
cd /srv/strips/backend && .venv/bin/python -c "from app.deps import get_current_user; print('ok')"
```

Esperado: `ok`.

- [ ] **Step 3: Commit**

```bash
cd /srv/strips
git add backend/app/deps.py
git commit -m "feat(deps): passar jwks_url para decode_jwt

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: `conftest.py` — keypair de teste, mock PyJWKClient, `make_user` ES256

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Adicionar imports e keypair no topo do módulo**

No bloco de imports do `conftest.py`, adicionar (depois de `import jwt`):

```python
from cryptography.hazmat.primitives.asymmetric import ec
```

Logo abaixo do bloco "Env-var gating" (após `_DB_AVAILABLE = ...`), adicionar:

```python
# ---------------------------------------------------------------------------
# Keypair ES256 de teste — gerado por processo. As fixtures assinam JWTs com
# a chave privada; o mock de PyJWKClient devolve a pública. Substitui o
# antigo SUPABASE_JWT_SECRET (HS256) — não é mais necessário nos testes.
# ---------------------------------------------------------------------------

_TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_TEST_PUBLIC_KEY = _TEST_PRIVATE_KEY.public_key()
_TEST_KID = "test-kid"
```

- [ ] **Step 2: Trocar `_DB_AVAILABLE` para depender só de TEST_DATABASE_URL**

Trocar:

```python
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
TEST_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

_DB_AVAILABLE = bool(TEST_DATABASE_URL) and bool(TEST_JWT_SECRET)
```

Por:

```python
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")

_DB_AVAILABLE = bool(TEST_DATABASE_URL)
```

- [ ] **Step 3: Atualizar `_patch_settings_for_tests` e adicionar mock do JWKS**

Trocar a fixture `_patch_settings_for_tests` por:

```python
@pytest.fixture(autouse=True)
def _patch_settings_for_tests(monkeypatch):
    """Garante que get_settings() reflita TEST_DATABASE_URL nos handlers do
    FastAPI e mocka PyJWKClient para devolver a chave pública de teste.
    """
    from app.config import get_settings

    get_settings.cache_clear()
    if TEST_DATABASE_URL:
        monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    # supabase_url é só usado para derivar supabase_jwks_url; um valor
    # fake basta porque PyJWKClient está mockado.
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "stirps-media")

    # Mock do JWKS — devolve sempre a chave pública de teste.
    class _FakeSigningKey:
        def __init__(self, key):
            self.key = key

    def fake_get_signing_key_from_jwt(self, token):
        return _FakeSigningKey(_TEST_PUBLIC_KEY)

    monkeypatch.setattr(
        "jwt.PyJWKClient.get_signing_key_from_jwt",
        fake_get_signing_key_from_jwt,
    )
    # Limpar o cache de cliente global em app.auth entre testes.
    import app.auth
    app.auth._jwk_client = None

    yield
    get_settings.cache_clear()
```

- [ ] **Step 4: Trocar `make_user` para assinar ES256**

Trocar o bloco `token = jwt.encode(...)` dentro de `make_user._make` por:

```python
        token = jwt.encode(
            {
                "sub": str(uid),
                "email": email,
                "role": "authenticated",
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            },
            _TEST_PRIVATE_KEY,
            algorithm="ES256",
            headers={"kid": _TEST_KID},
        )
```

- [ ] **Step 5: Expor o keypair via fixture pública**

Adicionar no `conftest.py` (qualquer local após o bloco do keypair):

```python
@pytest.fixture
def jwt_keypair() -> tuple:
    """Devolve (private_key, kid) para testes que precisam assinar JWTs
    fora da fixture make_user (e.g. test_auth.py)."""
    return _TEST_PRIVATE_KEY, _TEST_KID
```

- [ ] **Step 6: Atualizar mensagem do `pytest.skip` em `db_pool`**

Trocar:

```python
        pytest.skip(
            "TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários para testes integrados"
        )
```

Por:

```python
        pytest.skip(
            "TEST_DATABASE_URL necessário para testes integrados"
        )
```

- [ ] **Step 7: Verificar que `conftest.py` ainda importa**

```bash
cd /srv/strips/backend && .venv/bin/python -c "import tests.conftest; print('ok')"
```

Esperado: `ok`.

- [ ] **Step 8: Commit**

```bash
cd /srv/strips
git add backend/tests/conftest.py
git commit -m "test(conftest): assinar JWTs ES256 + mockar PyJWKClient

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Atualizar skip gates e tokens em `test_auth.py`

**Files:**
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Trocar skip gate**

Trocar:

```python
_DB_AVAILABLE = bool(os.getenv("TEST_DATABASE_URL")) and bool(os.getenv("SUPABASE_JWT_SECRET"))

pytestmark = pytest.mark.skipif(
    not _DB_AVAILABLE,
    reason="TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários",
)
```

Por:

```python
_DB_AVAILABLE = bool(os.getenv("TEST_DATABASE_URL"))

pytestmark = pytest.mark.skipif(
    not _DB_AVAILABLE,
    reason="TEST_DATABASE_URL necessário",
)
```

- [ ] **Step 2: Trocar token "inválido" do `test_me_with_invalid_jwt_returns_401`**

O teste assina um token HS256 com segredo errado. Com ES256 o equivalente é
assinar com OUTRA chave privada (PyJWKClient devolve a pública de teste; a
verificação falha em `InvalidSignatureError`). Usar a fixture `jwt_keypair`
para pegar o `kid` correto.

Trocar:

```python
@pytest.mark.anyio
async def test_me_with_invalid_jwt_returns_401(client):
    """JWT assinado com segredo errado → InvalidTokenError → 401."""
    bad = jwt.encode({"sub": "not-a-uuid"}, "wrong-secret", algorithm="HS256")
    async with client(token=bad) as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 401
```

Por:

```python
@pytest.mark.anyio
async def test_me_with_invalid_jwt_returns_401(client, jwt_keypair):
    """JWT assinado com chave EC errada → InvalidSignatureError → 401."""
    from cryptography.hazmat.primitives.asymmetric import ec
    _, kid = jwt_keypair
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    bad = jwt.encode(
        {"sub": "not-a-uuid"},
        wrong_key,
        algorithm="ES256",
        headers={"kid": kid},
    )
    async with client(token=bad) as c:
        resp = await c.get("/api/me")
    assert resp.status_code == 401
```

- [ ] **Step 3: Trocar token de `test_profile_autocreated_on_signup`**

Adicionar `jwt_keypair` à assinatura da função, trocar o `jwt.encode` para ES256:

Trocar:

```python
@pytest.mark.anyio
async def test_profile_autocreated_on_signup(client, db_pool):
```

Por:

```python
@pytest.mark.anyio
async def test_profile_autocreated_on_signup(client, db_pool, jwt_keypair):
```

E trocar:

```python
        token = jwt.encode(
            {
                "sub": str(uid),
                "email": email,
                "role": "authenticated",
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            },
            os.environ["SUPABASE_JWT_SECRET"],
            algorithm="HS256",
        )
```

Por:

```python
        private_key, kid = jwt_keypair
        token = jwt.encode(
            {
                "sub": str(uid),
                "email": email,
                "role": "authenticated",
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            },
            private_key,
            algorithm="ES256",
            headers={"kid": kid},
        )
```

- [ ] **Step 4: Verificar que `test_auth.py` coleta**

```bash
cd /srv/strips/backend && .venv/bin/pytest tests/test_auth.py --collect-only -q
```

Esperado: lista 5 testes (test_me_without_authorization_returns_401,
test_me_with_invalid_jwt_returns_401, test_me_returns_profile_for_authenticated_user,
test_me_includes_owned_tree_after_create, test_profile_autocreated_on_signup).

- [ ] **Step 5: Commit**

```bash
cd /srv/strips
git add backend/tests/test_auth.py
git commit -m "test(auth): trocar tokens HS256 por ES256 com keypair do conftest

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Atualizar skip gates nos demais testes

**Files:**
- Modify: `backend/tests/test_people.py:16-18`
- Modify: `backend/tests/test_media.py:23-25`
- Modify: `backend/tests/test_rls.py:22-24`
- Modify: `backend/tests/test_unions.py:18-20`

- [ ] **Step 1: Aplicar a mesma troca nos 4 arquivos**

Em cada um, trocar:

```python
pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL") or not os.getenv("SUPABASE_JWT_SECRET"),
    reason="TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários",
)
```

Por:

```python
pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)
```

- [ ] **Step 2: Rodar a suite completa sem DB**

```bash
cd /srv/strips/backend && .venv/bin/pytest tests/ -q
```

Esperado: todos os DB-gated continuam skipped (mesma quantidade de antes:
21), os unit tests do `test_auth_decode.py` passam (5 novos). Total: 175 passed, 21 skipped (ou similar — confirmar que não houve regressão).

Se algum teste falhar com `ImportError: cannot import name 'SUPABASE_JWT_SECRET'` ou referência ao secret antigo, grep:

```bash
grep -rn "SUPABASE_JWT_SECRET\|supabase_jwt_secret" /srv/strips/backend/app /srv/strips/backend/tests
```

E corrigir (não deve restar nenhuma referência).

- [ ] **Step 3: Commit**

```bash
cd /srv/strips
git add backend/tests/test_people.py backend/tests/test_media.py backend/tests/test_rls.py backend/tests/test_unions.py
git commit -m "test: remover SUPABASE_JWT_SECRET dos skip gates

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: `.env.example` — remover `SUPABASE_JWT_SECRET`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Trocar o bloco Supabase**

Trocar:

```ini
# Supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_JWT_SECRET=replace-with-jwt-secret-from-supabase-start
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
SUPABASE_STORAGE_BUCKET=stirps-media
```

Por:

```ini
# Supabase
# Auth: validação ES256 via JWKS pública em {SUPABASE_URL}/auth/v1/.well-known/jwks.json
# (não é mais necessário um segredo simétrico — Supabase Cloud usa chaves assimétricas).
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
SUPABASE_STORAGE_BUCKET=stirps-media
```

- [ ] **Step 2: Commit**

```bash
cd /srv/strips
git add backend/.env.example
git commit -m "docs(env): remover SUPABASE_JWT_SECRET do .env.example

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Aplicar migration 0009 no Supabase Cloud

**Files:** nenhum arquivo modificado — operação de DB.

- [ ] **Step 1: Aplicar a migration**

```bash
cd /srv/strips/backend
set -a && . ./.env && set +a
psql "$DATABASE_URL" -f db/migrations/0009_profiles_trigger.sql
```

Esperado: `CREATE FUNCTION`, `DROP TRIGGER`, `CREATE TRIGGER` — todos sem erro.

- [ ] **Step 2: Verificar que a função e o trigger existem**

```bash
set -a && . ./.env && set +a
psql "$DATABASE_URL" -c "\df handle_new_user"
psql "$DATABASE_URL" -c "select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;"
```

Esperado: `\df` mostra a função; o trigger `on_auth_user_created` aparece na lista.

- [ ] **Step 3: Confirmar idempotência reaplicando**

```bash
set -a && . ./.env && set +a
psql "$DATABASE_URL" -f db/migrations/0009_profiles_trigger.sql
```

Esperado: mesmas mensagens, sem erro (graças ao `drop trigger if exists` + `create or replace`).

---

### Task 9: Subir backend localmente apontando para Supabase Cloud + smoke test

**Files:** nenhum arquivo modificado — validação manual.

- [ ] **Step 1: Subir uvicorn em background**

```bash
cd /srv/strips/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

(Rodar em background com `run_in_background`, ou em outro terminal.)

Esperado: log com `Application startup complete.`.

- [ ] **Step 2: Healthcheck**

```bash
curl -s http://127.0.0.1:8001/healthz
```

Esperado: `{"status":"ok"}`.

- [ ] **Step 3: Pegar `SUPABASE_ANON_KEY` do dashboard**

Project Settings → API → "anon public" key. Exportar para a sessão de teste (não persistir em `.env`):

```bash
export SUPABASE_ANON_KEY='eyJ...'
```

- [ ] **Step 4: Signup via Supabase Auth REST**

```bash
set -a && . /srv/strips/backend/.env && set +a
curl -sS -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.local","password":"smoke-test-1234","data":{"display_name":"Smoke Test"}}' \
  | tee /tmp/signup.json
```

Esperado: JSON com `access_token` (e `user.id`). Salvar token:

```bash
ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('/tmp/signup.json'))['access_token'])")
echo "${ACCESS_TOKEN:0:30}..."
```

- [ ] **Step 5: Chamar `/api/me`**

```bash
curl -sS -i http://127.0.0.1:8001/api/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Esperado: `HTTP/1.1 200 OK` e body JSON com `profile.display_name == "Smoke Test"`, `profile.id == <user.id>`, `trees == []`.

- [ ] **Step 6: Limpeza**

```bash
set -a && . /srv/strips/backend/.env && set +a
psql "$DATABASE_URL" -c "DELETE FROM auth.users WHERE email = 'smoke@test.local';"
```

Esperado: `DELETE 1`.

Parar o uvicorn (Ctrl+C ou kill do background).

---

### Task 10: Fechar Issue #21, atualizar Issue #12, push

**Files:** nenhum arquivo modificado — operações no GitHub.

- [ ] **Step 1: Push de todos os commits**

```bash
cd /srv/strips
git pull --rebase origin main   # caso o remoto tenha avançado
git push origin main
```

Esperado: push aceito.

- [ ] **Step 2: Comentar e fechar Issue #21**

```bash
gh issue comment 21 --repo cassioerodrigues/strips --body "Resolvido na main.

**Mudanças:**
- \`backend/app/auth.py\` — \`decode_jwt\` agora valida ES256 via \`PyJWKClient\` (cache + refetch on kid-miss).
- \`backend/app/config.py\` — remove \`supabase_jwt_secret\`, adiciona property \`supabase_jwks_url\` derivada de \`supabase_url\`.
- \`backend/app/deps.py\` — passa \`jwks_url\` para \`decode_jwt\`.
- \`backend/.env.example\` — \`SUPABASE_JWT_SECRET\` removido.
- Testes — keypair EC P-256 de teste + monkeypatch de \`PyJWKClient\`.

**Validação:** unit tests do \`decode_jwt\` (5 cenários) + smoke test end-to-end com signup real no Supabase Cloud → \`GET /api/me\` 200."

gh issue close 21 --repo cassioerodrigues/strips --reason completed
```

- [ ] **Step 3: Mover Issue #21 para Done no project board**

```bash
# Pegar o item-id da issue #21 no projeto
ITEM_ID=$(gh project item-list 2 --owner cassioerodrigues --limit 50 --format json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(next(i['id'] for i in d['items'] if i.get('content',{}).get('number')==21))")

gh project item-edit --id "$ITEM_ID" \
  --project-id PVT_kwHOEFLqPs4BXMSR \
  --field-id PVTSSF_lAHOEFLqPs4BXMSRzhSa4hg \
  --single-select-option-id 98236657
```

- [ ] **Step 4: Comentar na Issue #12 confirmando aplicação em prod**

```bash
gh issue comment 12 --repo cassioerodrigues/strips --body "Trigger \`on_auth_user_created\` aplicada no Supabase Cloud (projeto \`onbjspsksvpmhtpbicio\`). Validada via smoke test: signup pela API do Supabase Auth → \`GET /api/me\` 200 com \`display_name\` populado pela trigger."
```

---

## Verificação final

- [ ] Rodar suite completa local sem DB:
  ```bash
  cd /srv/strips/backend && .venv/bin/pytest tests/ -q
  ```
  Esperado: ~175 passed, 21 skipped (sem regressão).

- [ ] `git log --oneline origin/main..HEAD` está vazio (tudo pushado).

- [ ] Issue #21 fechada no GitHub e Done no board.

- [ ] Trigger ativa no Supabase: `select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;` retorna `on_auth_user_created`.

- [ ] `backend/.env` no servidor de produção precisa ter `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (já tem) e PODE remover `SUPABASE_JWT_SECRET` (não é mais lido). Depois, reiniciar `systemctl restart strips-api`. **Este passo é manual, fica com o usuário.**
