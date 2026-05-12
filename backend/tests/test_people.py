"""
test_people.py — CRUD de pessoas + /relations + /events com banco real (Issue #10).

Cobre os endpoints de people.py contra o app montado com pool real e JWT
assinado, garantindo que RLS deixa o owner operar normalmente.

Pulado quando TEST_DATABASE_URL/SUPABASE_JWT_SECRET ausentes.
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


@pytest.mark.anyio
async def test_create_list_get_patch_delete_person(client, seeded_tree):
    """Fluxo CRUD completo de pessoa para o owner."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        # CREATE
        resp = await c.post(
            f"/api/trees/{tree_id}/people",
            json={"first_name": "Carla", "last_name": "Silva", "sex": "F"},
        )
        assert resp.status_code == 201, resp.text
        person = resp.json()
        pid = person["id"]
        assert person["first_name"] == "Carla"

        # LIST (a árvore já tinha 1 pessoa do seeded_tree)
        resp = await c.get(f"/api/trees/{tree_id}/people")
        assert resp.status_code == 200
        people = resp.json()
        assert len(people) == 2
        assert any(p["id"] == pid for p in people)

        # GET detail
        resp = await c.get(f"/api/people/{pid}")
        assert resp.status_code == 200
        assert resp.json()["last_name"] == "Silva"

        # PATCH
        resp = await c.patch(f"/api/people/{pid}", json={"occupation": "engenheira"})
        assert resp.status_code == 200
        assert resp.json()["occupation"] == "engenheira"

        # DELETE
        resp = await c.delete(f"/api/people/{pid}")
        assert resp.status_code == 204
        # Confirma 404 após delete
        resp = await c.get(f"/api/people/{pid}")
        assert resp.status_code == 404


@pytest.mark.anyio
async def test_relations_endpoint(client, seeded_tree, db_pool):
    """Cria pai/filho + cônjuge + irmão e valida a montagem de /relations."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        father = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "Pedro", "sex": "M"})).json()
        mother = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "Maria", "sex": "F"})).json()
        child = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "João", "sex": "M"})).json()
        sibling = (await c.post(f"/api/trees/{tree_id}/people", json={"first_name": "Ana", "sex": "F"})).json()

        # Adiciona pais para child e sibling (mesmo casal → são irmãos)
        for parent in (father, mother):
            r = await c.post(
                f"/api/people/{child['id']}/parents",
                json={"parent_id": parent["id"], "kind": "biological"},
            )
            assert r.status_code == 201, r.text
            r = await c.post(
                f"/api/people/{sibling['id']}/parents",
                json={"parent_id": parent["id"], "kind": "biological"},
            )
            assert r.status_code == 201, r.text

        resp = await c.get(f"/api/people/{child['id']}/relations")
        assert resp.status_code == 200
        rels = resp.json()
        assert {p["id"] for p in rels["parents"]} == {father["id"], mother["id"]}
        assert {p["id"] for p in rels["siblings"]} == {sibling["id"]}


@pytest.mark.anyio
async def test_person_events_endpoint(client, seeded_tree):
    """POST /api/trees/{id}/events para pessoa e GET /api/people/{id}/events."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    async with client(token=token) as c:
        resp = await c.post(
            f"/api/trees/{tree_id}/events",
            json={
                "person_id": str(person_id),
                "type": "baptism",
                "year": 1990,
                "place": "São Paulo",
            },
        )
        assert resp.status_code == 201, resp.text

        resp = await c.get(f"/api/people/{person_id}/events")
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) == 1
        assert events[0]["type"] == "baptism"
        assert events[0]["year"] == 1990
