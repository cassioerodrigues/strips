"""
test_routers_timeline.py — smoke tests para /api/trees/{tree_id}/timeline (Issue #15).

Sem banco real: valida apenas:
  1. Endpoint está montado no path esperado.
  2. Sem Authorization → 401.
  3. UUID inválido em tree_id → 422.
  4. Query params inválidos (kind fora da whitelist, from_year não inteiro) → 422.

Testes contra banco real estão em test_timeline.py.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TREE_ID = uuid.uuid4()


@pytest.fixture(scope="module")
def app():
    return create_app()


@pytest.fixture
def authed_app(app):
    """App com auth bypass — para testar validação de query params sem JWT real."""
    from app.auth import Claims
    from app.deps import get_current_user, get_db_authenticated

    fake_user = Claims(sub=uuid.uuid4(), email="t@t.com", role="authenticated")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db_authenticated] = lambda: None
    yield app
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. Rotas montadas corretamente
# ---------------------------------------------------------------------------


class TestRoutesMounted:
    def _paths(self, app) -> list[str]:
        return [r.path for r in app.routes]

    def test_timeline_is_registered(self, app):
        assert "/api/trees/{tree_id}/timeline" in self._paths(app)


# ---------------------------------------------------------------------------
# 2. Sem token → 401
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_timeline_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 3. UUID inválidos em path params → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestPathParamValidation:
    async def test_timeline_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/timeline")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 4. Query params inválidos → 422
# ---------------------------------------------------------------------------


@pytest.mark.anyio
class TestQueryParamValidation:
    async def test_kind_invalid_value(self, authed_app):
        """?kind=invalid deve retornar 422 (fora da whitelist Literal)."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline?kind=invalido")
        assert r.status_code == 422

    async def test_from_year_not_integer(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline?from_year=abc")
        assert r.status_code == 422

    async def test_to_year_not_integer(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline?to_year=xyz")
        assert r.status_code == 422

    async def test_from_year_out_of_smallint_range(self, authed_app):
        """from_year fora do range smallint (-32768..32767) → 422 antes do banco."""
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline?from_year=99999999")
        assert r.status_code == 422

    async def test_to_year_out_of_smallint_range(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/timeline?to_year=-999999")
        assert r.status_code == 422

    async def test_kind_each_valid_value_accepted(self, authed_app):
        """?kind={value} para cada literal deve passar pela validação Pydantic.

        Usa override que injeta um stub para o service — assim verificamos só
        que a *parsing* dos query params funciona, sem precisar de banco real.
        """
        from app.routers import timeline as timeline_router

        # Stub: ignora args, devolve lista vazia.
        authed_app.dependency_overrides[timeline_router.get_db_authenticated] = lambda: None
        original = timeline_router.get_timeline
        timeline_router.get_timeline = lambda *args, **kwargs: []
        try:
            async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
                for kind in ("event", "birth", "death", "union"):
                    r = await c.get(f"/api/trees/{TREE_ID}/timeline?kind={kind}")
                    assert r.status_code == 200, (kind, r.status_code, r.text)
                # Multi-valor
                r = await c.get(f"/api/trees/{TREE_ID}/timeline?kind=birth&kind=death")
                assert r.status_code == 200, r.text
        finally:
            timeline_router.get_timeline = original
