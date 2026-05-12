"""
test_unions.py — ensure_uuid_order swap + check constraint via banco real (Issue #10).

Cobre:
  - POST /api/trees/{id}/unions com partner_b < partner_a → swap automático.
  - O CHECK constraint (partner_a_id < partner_b_id) nunca é violado pelo serviço.
  - Mesmo casal mesma data → unique_violation (409).

Pulado quando TEST_DATABASE_URL ausente.
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


def _two_people_with_known_order():
    """Devolve (a, b) onde a > b lexicograficamente — para forçar swap no service."""
    while True:
        a = uuid.uuid4()
        b = uuid.uuid4()
        if str(a) > str(b):
            return a, b


@pytest.mark.anyio
async def test_union_swaps_partners_when_passed_in_reverse_order(client, seeded_tree, db_pool):
    """Cliente envia partner_a > partner_b; serviço aplica ensure_uuid_order."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    # Cria duas pessoas e descobre quem é "maior" lexicograficamente
    async with client(token=token) as c:
        p1 = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "P1"})).json()
        p2 = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "P2"})).json()
        greater = p1["id"] if p1["id"] > p2["id"] else p2["id"]
        smaller = p2["id"] if p1["id"] > p2["id"] else p1["id"]

        # Envia em ordem invertida (greater como partner_a)
        resp = await c.post(
            f"/api/trees/{tree_id}/unions",
            json={
                "partner_a_id": greater,
                "partner_b_id": smaller,
                "type": "marriage",
                "status": "ongoing",
                "start_year": 2020,
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # O service deveria ter normalizado para a < b.
        assert body["partner_a_id"] == smaller
        assert body["partner_b_id"] == greater

    # Sanity: o CHECK constraint do banco confirma a < b.
    with db_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT partner_a_id < partner_b_id FROM unions WHERE id = %s",
                (body["id"],),
            )
            row = cur.fetchone()
    assert row is not None and row[0] is True


@pytest.mark.anyio
async def test_union_duplicate_pair_period_returns_409(client, seeded_tree):
    """unions_unique_pair_period: mesmo (a, b, start_year) → unique_violation."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        p1 = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "X"})).json()
        p2 = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "Y"})).json()

        payload = {
            "partner_a_id": p1["id"],
            "partner_b_id": p2["id"],
            "type": "marriage",
            "status": "ongoing",
            "start_year": 1999,
        }
        r1 = await c.post(f"/api/trees/{tree_id}/unions", json=payload)
        assert r1.status_code == 201, r1.text

        r2 = await c.post(f"/api/trees/{tree_id}/unions", json=payload)
        assert r2.status_code == 409, r2.text


@pytest.mark.anyio
async def test_union_self_partner_returns_422(client, seeded_tree):
    """CHECK (partner_a_id <> partner_b_id) — banco mapeia para 422."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    async with client(token=token) as c:
        resp = await c.post(
            f"/api/trees/{tree_id}/unions",
            json={
                "partner_a_id": str(person_id),
                "partner_b_id": str(person_id),
                "type": "marriage",
                "status": "ongoing",
            },
        )
    # CHECK (partner_a_id <> partner_b_id) viola → CheckViolation → 422
    # (mas também pode disparar o CHECK (a < b) primeiro; aceitar ambos).
    assert resp.status_code in (422, 409), resp.text
