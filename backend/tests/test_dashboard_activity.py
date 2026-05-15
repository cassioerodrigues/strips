"""Testes integrados de /api/trees/{tree_id}/dashboard-activity."""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


def _insert_media(db_pool, tree_id: uuid.UUID, uploaded_by: uuid.UUID) -> uuid.UUID:
    media_id = uuid.uuid4()
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO media(
                    id, tree_id, kind, storage_path, title, uploaded_by, uploaded_at
                ) VALUES (
                    %s, %s, 'photo'::media_kind_t, %s, 'Retrato antigo', %s, now() + interval '2 minutes'
                )
                """,
                (
                    media_id,
                    tree_id,
                    f"tree_{tree_id}/tree/{tree_id}/retrato.jpg",
                    uploaded_by,
                ),
            )
        conn.commit()
    return media_id


def _insert_external_record(db_pool, tree_id: uuid.UUID, person_id: uuid.UUID) -> uuid.UUID:
    record_id = uuid.uuid4()
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO external_records(
                    id, tree_id, person_id, source, title, subtitle,
                    confidence, status, created_at
                ) VALUES (
                    %s, %s, %s, 'familysearch', 'Registro de batismo',
                    'Olinda, 1884', 88, 'suggested'::record_status_t,
                    now() + interval '4 minutes'
                )
                """,
                (record_id, tree_id, person_id),
            )
        conn.commit()
    return record_id


@pytest.mark.anyio
async def test_dashboard_activity_derives_recent_items(client, seeded_tree, db_pool):
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    user_id = seeded_tree["user_a"]
    person_id = seeded_tree["person_a"]

    _insert_media(db_pool, tree_id, user_id)
    _insert_external_record(db_pool, tree_id, person_id)

    async with client(token=token) as c:
        created = await c.post(
            f"/api/trees/{tree_id}/people",
            json={
                "first_name": "Ana",
                "last_name": "Souza",
                "display_name": "Ana Souza",
            },
        )
        assert created.status_code == 201, created.text

        resp = await c.get(f"/api/trees/{tree_id}/dashboard-activity?limit=6")

    assert resp.status_code == 200, resp.text
    items = resp.json()
    kinds = {item["kind"] for item in items}

    assert {"person_created", "media_uploaded", "suggestion_created"}.issubset(kinds)
    assert items == sorted(items, key=lambda item: item["occurred_at"], reverse=True)
    assert all({"id", "kind", "title", "occurred_at"}.issubset(item) for item in items)


@pytest.mark.anyio
async def test_dashboard_activity_rls_blocks_non_member(client, seeded_tree):
    token_b = seeded_tree["token_b"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_b) as c:
        resp = await c.get(f"/api/trees/{tree_a}/dashboard-activity")

    assert resp.status_code == 404, resp.text
