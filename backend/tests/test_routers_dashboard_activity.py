"""Smoke tests para /api/trees/{tree_id}/dashboard-activity."""
from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app

TREE_ID = uuid.uuid4()


@pytest.fixture(scope="module")
def app():
    return create_app()


@pytest.fixture
def authed_app(app):
    from app.auth import Claims
    from app.deps import get_current_user, get_db_authenticated
    from app.routers import dashboard_activity as dashboard_activity_router

    fake_user = Claims(sub=uuid.uuid4(), email="t@t.com", role="authenticated")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_db_authenticated] = lambda: None

    original = dashboard_activity_router.get_dashboard_activity
    dashboard_activity_router.get_dashboard_activity = lambda *args, **kwargs: []
    try:
        yield app
    finally:
        dashboard_activity_router.get_dashboard_activity = original
        app.dependency_overrides.clear()


class TestRoutesMounted:
    def _paths(self, app) -> list[str]:
        return [r.path for r in app.routes]

    def test_dashboard_activity_is_registered(self, app):
        assert "/api/trees/{tree_id}/dashboard-activity" in self._paths(app)


@pytest.mark.anyio
class TestUnauthorizedReturns401:
    async def test_dashboard_activity_no_token(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/dashboard-activity")
        assert r.status_code == 401


@pytest.mark.anyio
class TestPathAndQueryValidation:
    async def test_bad_tree_uuid(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get("/api/trees/nao-e-uuid/dashboard-activity")
        assert r.status_code == 422

    async def test_limit_too_high(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/dashboard-activity?limit=500")
        assert r.status_code == 422

    async def test_valid_limit_reaches_service(self, authed_app):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as c:
            r = await c.get(f"/api/trees/{TREE_ID}/dashboard-activity?limit=3")
        assert r.status_code == 200
        assert r.json() == []
