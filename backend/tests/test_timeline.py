"""
test_timeline.py — testes integrados de /api/trees/{tree_id}/timeline (Issue #15).

Cobre ordenação, filtros e RLS contra banco real. Pulado quando
TEST_DATABASE_URL ausente.

Cenário básico: cria uma pessoa adicional com birth/death + uma união
+ um evento na árvore A; valida montagem da lista, ordenação, filtros
from_year/to_year/kind, e isolamento RLS (usuário B não vê tree A).
"""
from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL necessário",
)


# ---------------------------------------------------------------------------
# Helpers — populam a árvore A com 2 pessoas, 1 união, 1 evento.
# ---------------------------------------------------------------------------


async def _seed_minimal_timeline(c, tree_id, alice_id):
    """Insere dados temporais variados na árvore para exercitar a timeline.

    Estado pós-seed (na árvore A):
      - Alice (já criada pelo fixture, sem datas)
      - Carlos: birth=1900-05-10, death=1980-03-02 (is_living=False)
      - Maria: birth=1905-08-15
      - Casamento Carlos×Maria em 1925
      - Evento imigração de Carlos em 1920

    Total esperado de itens: 5 (1 birth+1 death Carlos, 1 birth Maria,
    1 union, 1 event).
    """
    # Pessoa com data de nascimento e morte
    carlos = (await c.post(
        f"/api/trees/{tree_id}/people",
        json={
            "first_name": "Carlos",
            "last_name": "Bertolini",
            "display_name": "Carlos Bertolini",
            "sex": "M",
            "is_living": False,
            "birth_year": 1900, "birth_month": 5, "birth_day": 10,
            "birth_place": "Genova, IT",
            "death_year": 1980, "death_month": 3, "death_day": 2,
            "death_place": "São Paulo, BR",
            "death_cause": "natural",
        },
    )).json()

    maria = (await c.post(
        f"/api/trees/{tree_id}/people",
        json={
            "first_name": "Maria",
            "last_name": "Silva",
            "display_name": "Maria Silva",
            "sex": "F",
            "birth_year": 1905, "birth_month": 8, "birth_day": 15,
            "birth_place": "São Paulo, BR",
        },
    )).json()

    # União Carlos × Maria
    smaller, greater = sorted([carlos["id"], maria["id"]])
    union = (await c.post(
        f"/api/trees/{tree_id}/unions",
        json={
            "partner_a_id": smaller,
            "partner_b_id": greater,
            "type": "marriage",
            "status": "ongoing",
            "start_year": 1925,
            "start_month": 6,
            "start_place": "São Paulo, BR",
        },
    )).json()

    # Evento de imigração de Carlos
    event = (await c.post(
        f"/api/trees/{tree_id}/events",
        json={
            "person_id": carlos["id"],
            "type": "immigration",
            "year": 1920,
            "place": "Porto de Santos, BR",
            "description": "Chegada via Genoa",
        },
    )).json()

    return {"carlos": carlos, "maria": maria, "union": union, "event": event}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_timeline_returns_unified_chronological_list(client, seeded_tree):
    """GET /timeline retorna births + deaths + unions + events ordenados."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        seeded = await _seed_minimal_timeline(c, tree_id, seeded_tree["person_a"])

        resp = await c.get(f"/api/trees/{tree_id}/timeline")
        assert resp.status_code == 200, resp.text
        items = resp.json()

    # 1 birth Carlos + 1 death Carlos + 1 birth Maria + 1 union + 1 event = 5
    assert len(items) == 5

    kinds = [it["kind"] for it in items]
    assert kinds.count("birth") == 2
    assert kinds.count("death") == 1
    assert kinds.count("union") == 1
    assert kinds.count("event") == 1

    # Ordenação cronológica: Carlos 1900 birth → Maria 1905 birth → Carlos 1920 immigration
    # → Carlos×Maria 1925 union → Carlos 1980 death
    years = [it["year"] for it in items]
    assert years == [1900, 1905, 1920, 1925, 1980]


@pytest.mark.anyio
async def test_timeline_title_is_localized_pt(client, seeded_tree):
    """Verifica que o `title` é renderizado em PT-BR para cada kind."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        await _seed_minimal_timeline(c, tree_id, seeded_tree["person_a"])
        resp = await c.get(f"/api/trees/{tree_id}/timeline")

    items = resp.json()
    titles = [it["title"] for it in items]

    # Spec example: "Imigração de Giuseppe Bertolini"
    assert any("Imigração de Carlos Bertolini" == t for t in titles), titles
    assert any("Nascimento de Carlos Bertolini" == t for t in titles), titles
    assert any("Falecimento de Carlos Bertolini" == t for t in titles), titles
    assert any("Casamento de" in t and "Carlos Bertolini" in t and "Maria Silva" in t
               for t in titles), titles


@pytest.mark.anyio
async def test_timeline_from_to_year_filters(client, seeded_tree):
    """?from_year=1910&to_year=1930 deve filtrar pelos bounds inclusivos."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        await _seed_minimal_timeline(c, tree_id, seeded_tree["person_a"])
        resp = await c.get(
            f"/api/trees/{tree_id}/timeline?from_year=1910&to_year=1930"
        )

    assert resp.status_code == 200, resp.text
    items = resp.json()
    # Restam: evento 1920 + união 1925 = 2 itens.
    assert len(items) == 2
    assert {it["year"] for it in items} == {1920, 1925}


@pytest.mark.anyio
async def test_timeline_kind_multi_filter(client, seeded_tree):
    """?kind=birth&kind=death filtra apenas itens de pessoa (nascimentos/mortes)."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]

    async with client(token=token) as c:
        await _seed_minimal_timeline(c, tree_id, seeded_tree["person_a"])
        resp = await c.get(
            f"/api/trees/{tree_id}/timeline?kind=birth&kind=death"
        )

    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 3  # 2 births + 1 death
    assert {it["kind"] for it in items} == {"birth", "death"}


@pytest.mark.anyio
async def test_timeline_rls_blocks_non_member(client, seeded_tree):
    """Usuário B não é membro da árvore A → 404 (RLS)."""
    token_b = seeded_tree["token_b"]
    tree_a = seeded_tree["tree_a"]

    async with client(token=token_b) as c:
        resp = await c.get(f"/api/trees/{tree_a}/timeline")

    assert resp.status_code == 404, resp.text


@pytest.mark.anyio
async def test_timeline_nonexistent_tree_returns_404(client, seeded_tree):
    token = seeded_tree["token_a"]
    bogus_tree = uuid.uuid4()

    async with client(token=token) as c:
        resp = await c.get(f"/api/trees/{bogus_tree}/timeline")

    assert resp.status_code == 404, resp.text


@pytest.mark.anyio
async def test_timeline_includes_null_year_events_at_bottom(client, seeded_tree):
    """Eventos sem ano aparecem ao final (NULLS LAST) — quando sem filtros."""
    token = seeded_tree["token_a"]
    tree_id = seeded_tree["tree_a"]
    person_id = seeded_tree["person_a"]

    async with client(token=token) as c:
        # Evento sem year
        await c.post(
            f"/api/trees/{tree_id}/events",
            json={
                "person_id": str(person_id),
                "type": "occupation",
                "place": "lugar nenhum",
            },
        )
        # Evento com year
        await c.post(
            f"/api/trees/{tree_id}/events",
            json={
                "person_id": str(person_id),
                "type": "baptism",
                "year": 1990,
            },
        )

        resp = await c.get(f"/api/trees/{tree_id}/timeline")

    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 2
    # Primeiro o que tem ano; depois o NULL.
    assert items[0]["year"] == 1990
    assert items[1]["year"] is None
