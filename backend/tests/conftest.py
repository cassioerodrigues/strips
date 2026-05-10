"""
conftest.py — fixtures compartilhadas para os testes de integração da Issue #10.

Todas as fixtures de banco são puladas (`pytest.skip`) quando `TEST_DATABASE_URL`
ou `SUPABASE_JWT_SECRET` não estão definidos no ambiente — assim o arquivo pode
conviver com a suite de smoke tests existente sem exigir Postgres.

Para rodar os testes integrados, ver `README.md` seção "Rodar testes".
"""
from __future__ import annotations

import os
import uuid
from collections.abc import Callable, Iterator
from datetime import datetime, timedelta, timezone

import jwt
import pytest

# ---------------------------------------------------------------------------
# Env-var gating: tudo que precisa de banco real depende destas duas vars.
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
TEST_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

_DB_AVAILABLE = bool(TEST_DATABASE_URL) and bool(TEST_JWT_SECRET)


# ---------------------------------------------------------------------------
# anyio backend — todos os @pytest.mark.anyio usam asyncio (única instalação).
# ---------------------------------------------------------------------------


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# ---------------------------------------------------------------------------
# Pool e settings: criado uma única vez por sessão.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def db_pool():
    """ConnectionPool apontando para TEST_DATABASE_URL.

    Pressupõe que as migrations já foram aplicadas (via `supabase db reset`
    ou equivalente — ver README). Roda como service-role / superuser para
    permitir INSERT em `auth.users` e bypass de RLS quando necessário no setup.
    """
    if not _DB_AVAILABLE:
        pytest.skip(
            "TEST_DATABASE_URL e SUPABASE_JWT_SECRET necessários para testes integrados"
        )

    from psycopg_pool import ConnectionPool

    pool = ConnectionPool(
        TEST_DATABASE_URL,
        min_size=1,
        max_size=4,
        open=False,
    )
    pool.open(wait=True, timeout=10)
    try:
        yield pool
    finally:
        pool.close()


@pytest.fixture(autouse=True)
def _patch_settings_for_tests(monkeypatch):
    """Garante que get_settings() reflita TEST_DATABASE_URL / SUPABASE_JWT_SECRET
    nos handlers do FastAPI (sem precisar de .env separado para testes).

    Como get_settings() é @lru_cache, limpamos o cache antes/depois.
    """
    from app.config import get_settings

    get_settings.cache_clear()
    if TEST_DATABASE_URL:
        monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    if TEST_JWT_SECRET:
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    # Storage HTTP é mockado em test_media.py via respx — basta um valor fake.
    monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "stirps-media")
    yield
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# make_user: cria auth.users + profiles e devolve (uid, jwt). Cleanup ao final.
# ---------------------------------------------------------------------------


MakeUserFn = Callable[..., tuple[uuid.UUID, str]]


@pytest.fixture
def make_user(db_pool) -> Iterator[MakeUserFn]:
    """Factory para criar usuários sintéticos.

    Pressupõe que a conexão é privilegiada (service_role/superuser) para
    poder inserir em `auth.users` — esquema próprio do Supabase.
    """
    created: list[uuid.UUID] = []

    def _make(
        display_name: str = "Test User",
        email_prefix: str = "user",
        role: str | None = None,
        tree_id: uuid.UUID | None = None,
    ) -> tuple[uuid.UUID, str]:
        """Cria auth.users + profiles e devolve (uid, jwt).

        Quando ``role`` é informado, também insere a linha correspondente em
        ``tree_members`` — exige ``tree_id`` (a árvore precisa existir antes
        da chamada). Sem ``role``, mantém o comportamento original (sem
        membership), útil para cenários em que a árvore ainda nem existe.
        """
        if role is not None and tree_id is None:
            raise ValueError("make_user(role=...) requires tree_id")

        uid = uuid.uuid4()
        email = f"{email_prefix}-{uid.hex[:8]}@test.local"
        with db_pool.connection() as conn:
            with conn.cursor() as cur:
                # `auth.users` em Supabase local tem defaults para a maioria das
                # colunas; replicamos o approach do seed (apenas id + email).
                # Se sua versão do Supabase exigir mais (instance_id, aud, role,
                # email_confirmed_at), preencha aqui — ver db/seed/seed_from_mockup.py.
                cur.execute(
                    "INSERT INTO auth.users (id, email) VALUES (%s, %s)",
                    (uid, email),
                )
                cur.execute(
                    "INSERT INTO profiles (id, display_name) VALUES (%s, %s)",
                    (uid, display_name),
                )
                if role is not None:
                    cur.execute(
                        "INSERT INTO tree_members (tree_id, user_id, role) VALUES (%s, %s, %s)",
                        (tree_id, uid, role),
                    )
            conn.commit()

        token = jwt.encode(
            {
                "sub": str(uid),
                "email": email,
                "role": "authenticated",
                "iat": int(datetime.now(timezone.utc).timestamp()),
                "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            },
            TEST_JWT_SECRET,
            algorithm="HS256",
        )
        created.append(uid)
        return uid, token

    yield _make

    # Cleanup: DELETE em auth.users dispara cascade em profiles, trees, etc.
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            for uid in created:
                cur.execute("DELETE FROM auth.users WHERE id = %s", (uid,))
        conn.commit()


# ---------------------------------------------------------------------------
# client: AsyncClient sobre ASGITransport, com factory por token.
# ---------------------------------------------------------------------------


@pytest.fixture
def app_instance(db_pool):
    """App FastAPI com pool injetado em app.state.pool — bypassa o lifespan
    (que abriria um pool novo a cada teste e tornaria o ciclo lento).
    """
    from app.main import create_app

    app = create_app()
    app.state.pool = db_pool
    return app


@pytest.fixture
def client(app_instance):
    """Factory `client(token=None)` que devolve um httpx.AsyncClient pronto."""
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app_instance)

    def _factory(token: str | None = None) -> AsyncClient:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return AsyncClient(transport=transport, base_url="http://test", headers=headers)

    return _factory


# ---------------------------------------------------------------------------
# seeded_tree: 2 usuários, 2 árvores, 1 pessoa em cada.
# ---------------------------------------------------------------------------


@pytest.fixture
def seeded_tree(db_pool, make_user) -> dict:
    """Cria dois usuários donos cada um de sua própria árvore com 1 pessoa.

    Retorna um dict com tokens e ids para uso nos testes. Limpeza acontece
    via cascade ao deletar `auth.users` em `make_user`.
    """
    user_a, token_a = make_user(display_name="Alice", email_prefix="alice")
    user_b, token_b = make_user(display_name="Bob", email_prefix="bob")

    tree_a = uuid.uuid4()
    tree_b = uuid.uuid4()
    person_a = uuid.uuid4()
    person_b = uuid.uuid4()

    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO trees (id, owner_id, name) VALUES (%s, %s, %s), (%s, %s, %s)",
                (tree_a, user_a, "Tree A", tree_b, user_b, "Tree B"),
            )
            cur.execute(
                "INSERT INTO tree_members (tree_id, user_id, role) VALUES "
                "(%s, %s, 'owner'), (%s, %s, 'owner')",
                (tree_a, user_a, tree_b, user_b),
            )
            cur.execute(
                "INSERT INTO persons (id, tree_id, first_name, last_name, sex) VALUES "
                "(%s, %s, 'Alice', 'A', 'F'), (%s, %s, 'Bob', 'B', 'M')",
                (person_a, tree_a, person_b, tree_b),
            )
        conn.commit()

    return {
        "user_a": user_a,
        "user_b": user_b,
        "token_a": token_a,
        "token_b": token_b,
        "tree_a": tree_a,
        "tree_b": tree_b,
        "person_a": person_a,
        "person_b": person_b,
    }


# ---------------------------------------------------------------------------
# rls_conn: connection helper que aplica SET LOCAL como um usuário arbitrário.
# Útil para exercitar RLS direto em SQL (cenário "editor não pode alterar
# membership" da Issue #10).
# ---------------------------------------------------------------------------


@pytest.fixture
def rls_conn(db_pool):
    """Context manager: `with rls_conn(uid) as conn: ...` configura claims."""
    import json
    from contextlib import contextmanager

    @contextmanager
    def _open(user_sub: uuid.UUID):
        claims = json.dumps({"sub": str(user_sub), "role": "authenticated"})
        with db_pool.connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SET LOCAL ROLE authenticated")
                    cur.execute('SET LOCAL "request.jwt.claims" = %s', (claims,))
                yield conn

    return _open
