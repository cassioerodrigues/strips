"""people.py — serviços de banco para pessoas e suas relações.

Usa SQL bruto via psycopg com dict_row.
A conexão já está numa transação com SET LOCAL configurado pelo
get_db_authenticated de deps.py — RLS é aplicado automaticamente.

Sort keys são whitelistadas para nunca interpolar input externo no SQL.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.event import EventOut
from app.schemas.media import MediaOut
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate
from app.schemas.relations import ParentLinkCreate, ParentLinkOut, RelationsResponse

# Whitelist de sort keys — nunca interpole input externo diretamente no SQL.
_SORT_MAP: dict[str, str] = {
    "name": "COALESCE(display_name, last_name || ' ' || first_name) ASC NULLS LAST",
    "year": "birth_year NULLS LAST",
    "generation": "(external_ids->>'generation')::int NULLS LAST",
}


# ---------------------------------------------------------------------------
# List + CRUD
# ---------------------------------------------------------------------------


def list_people(
    conn: Connection,
    tree_id: uuid.UUID,
    search: str | None,
    sort: str,
    limit: int,
    offset: int,
) -> list[PersonOut]:
    """Lista paginada de pessoas numa árvore com filtros e ordenação."""
    order_expr = _SORT_MAP[sort]

    params: list[Any] = [tree_id]
    where_extra = ""
    if search:
        where_extra = (
            " AND ("
            r"  display_name ILIKE %s ESCAPE '\\'"
            r"  OR first_name ILIKE %s ESCAPE '\\'"
            r"  OR last_name  ILIKE %s ESCAPE '\\'"
            r"  OR maiden_name ILIKE %s ESCAPE '\\'"
            ")"
        )
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        term = f"%{escaped}%"
        params.extend([term, term, term, term])

    # Safe: order_expr vem exclusivamente da whitelist _SORT_MAP acima.
    sql = f"""
        SELECT
            id, tree_id,
            first_name, middle_names, last_name, maiden_name, display_name,
            sex, is_living,
            birth_year, birth_month, birth_day, birth_place,
            death_year, death_month, death_day, death_place, death_cause,
            occupation, bio, tags, photo_media_id,
            family_search_id, gedcom_id, external_ids,
            created_by, created_at, updated_at
        FROM persons
        WHERE tree_id = %s
        {where_extra}
        ORDER BY {order_expr}
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return [PersonOut.model_validate(r) for r in cur.fetchall()]


def create_person(
    conn: Connection,
    tree_id: uuid.UUID,
    user_sub: uuid.UUID,
    payload: PersonCreate,
) -> PersonOut:
    """Cria uma nova pessoa na árvore especificada."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO persons(
                tree_id,
                first_name, middle_names, last_name, maiden_name, display_name,
                sex, is_living,
                birth_year, birth_month, birth_day, birth_place,
                death_year, death_month, death_day, death_place, death_cause,
                occupation, bio, tags, photo_media_id,
                family_search_id, gedcom_id, external_ids,
                created_by
            ) VALUES (
                %s,
                %s, %s, %s, %s, %s,
                %s::sex_t, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s::jsonb,
                %s
            )
            RETURNING
                id, tree_id,
                first_name, middle_names, last_name, maiden_name, display_name,
                sex, is_living,
                birth_year, birth_month, birth_day, birth_place,
                death_year, death_month, death_day, death_place, death_cause,
                occupation, bio, tags, photo_media_id,
                family_search_id, gedcom_id, external_ids,
                created_by, created_at, updated_at
            """,
            (
                tree_id,
                payload.first_name,
                payload.middle_names,
                payload.last_name,
                payload.maiden_name,
                payload.display_name,
                payload.sex,
                payload.is_living,
                payload.birth_year,
                payload.birth_month,
                payload.birth_day,
                payload.birth_place,
                payload.death_year,
                payload.death_month,
                payload.death_day,
                payload.death_place,
                payload.death_cause,
                payload.occupation,
                payload.bio,
                payload.tags,
                payload.photo_media_id,
                payload.family_search_id,
                payload.gedcom_id,
                json.dumps(payload.external_ids or {}),
                user_sub,
            ),
        )
        row = cur.fetchone()
        if row is None:  # pragma: no cover
            raise RuntimeError("INSERT INTO persons RETURNING returned no row")
    return PersonOut.model_validate(row)


def get_person(conn: Connection, person_id: uuid.UUID) -> PersonOut:
    """Retorna detalhe de uma pessoa; 404 se não existir ou RLS bloquear."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                id, tree_id,
                first_name, middle_names, last_name, maiden_name, display_name,
                sex, is_living,
                birth_year, birth_month, birth_day, birth_place,
                death_year, death_month, death_day, death_place, death_cause,
                occupation, bio, tags, photo_media_id,
                family_search_id, gedcom_id, external_ids,
                created_by, created_at, updated_at
            FROM persons
            WHERE id = %s
            """,
            (person_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")

    return PersonOut.model_validate(row)


def update_person(
    conn: Connection,
    person_id: uuid.UUID,
    payload: PersonUpdate,
) -> PersonOut:
    """Atualiza somente os campos enviados (PATCH parcial)."""
    fields = payload.model_dump(exclude_unset=True)

    # Whitelist de campos editáveis.
    allowed = {
        "first_name", "middle_names", "last_name", "maiden_name", "display_name",
        "sex", "is_living",
        "birth_year", "birth_month", "birth_day", "birth_place",
        "death_year", "death_month", "death_day", "death_place", "death_cause",
        "occupation", "bio", "tags", "photo_media_id",
        "family_search_id", "gedcom_id", "external_ids",
    }
    valid_fields = {k: v for k, v in fields.items() if k in allowed}
    if "external_ids" in valid_fields:
        valid_fields["external_ids"] = json.dumps(valid_fields["external_ids"] or {})

    if not valid_fields:
        return get_person(conn, person_id)

    # Safe: keys vêm da whitelist `allowed` acima.
    set_clauses = [f"{k} = %s" for k in valid_fields]
    sql = (
        f"UPDATE persons SET {', '.join(set_clauses)}, updated_at = now() "
        f"WHERE id = %s "
        f"RETURNING "
        f"id, tree_id, "
        f"first_name, middle_names, last_name, maiden_name, display_name, "
        f"sex, is_living, "
        f"birth_year, birth_month, birth_day, birth_place, "
        f"death_year, death_month, death_day, death_place, death_cause, "
        f"occupation, bio, tags, photo_media_id, "
        f"family_search_id, gedcom_id, external_ids, "
        f"created_by, created_at, updated_at"
    )
    params = [*valid_fields.values(), person_id]

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")

    return PersonOut.model_validate(row)


def delete_person(conn: Connection, person_id: uuid.UUID) -> None:
    """Remove pessoa; cascade em person_parents/unions/events é automático."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM persons WHERE id = %s", (person_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")


# ---------------------------------------------------------------------------
# Relations
# ---------------------------------------------------------------------------


def get_relations(conn: Connection, person_id: uuid.UUID) -> RelationsResponse:
    """Deriva relações de uma pessoa (pais, cônjuge, irmãos, filhos).

    Replica a lógica de frontend/components/profile.jsx:10-17.
    4 queries de dados + 1 de validação = 5 round-trips no banco:
      0. validação — get_person para garantir existência e aplicar RLS
      1. parents — via person_parents JOIN persons
      2. spouse — via unions (primeiro union, mais antigo)
      3. siblings — shared parents excluindo :id
      4. children — reverse person_parents
    TODO: consolidar em CTE única para reduzir round-trips (#tech-debt).
    """
    # Garantir que a pessoa existe (404 se RLS bloquear ou não existir).
    get_person(conn, person_id)

    _person_cols = """
        p.id, p.tree_id,
        p.first_name, p.middle_names, p.last_name, p.maiden_name, p.display_name,
        p.sex, p.is_living,
        p.birth_year, p.birth_month, p.birth_day, p.birth_place,
        p.death_year, p.death_month, p.death_day, p.death_place, p.death_cause,
        p.occupation, p.bio, p.tags, p.photo_media_id,
        p.family_search_id, p.gedcom_id, p.external_ids,
        p.created_by, p.created_at, p.updated_at
    """

    # Query 1: parents
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT {_person_cols}
            FROM person_parents pp
            JOIN persons p ON p.id = pp.parent_id
            WHERE pp.child_id = %s
            ORDER BY p.display_name
            """,
            (person_id,),
        )
        parents = [PersonOut.model_validate(r) for r in cur.fetchall()]

    # Query 2a: spouse — primeiro union (qualquer status), mais antigo primeiro.
    # Replica frontend/components/profile.jsx:10-17 que não filtra por status.
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT {_person_cols}
            FROM unions u
            JOIN persons p ON p.id = CASE
                WHEN u.partner_a_id = %s THEN u.partner_b_id
                ELSE u.partner_a_id
            END
            WHERE (u.partner_a_id = %s OR u.partner_b_id = %s)
            ORDER BY u.start_year ASC NULLS LAST, u.id ASC
            LIMIT 1
            """,
            (person_id, person_id, person_id),
        )
        spouse_row = cur.fetchone()
    spouse = PersonOut.model_validate(spouse_row) if spouse_row else None

    # Query 2b: siblings — compartilham pelo menos um parent com :id, excluindo :id
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT DISTINCT {_person_cols}
            FROM person_parents pp_sib
            JOIN persons p ON p.id = pp_sib.child_id
            WHERE pp_sib.parent_id IN (
                SELECT parent_id FROM person_parents WHERE child_id = %s
            )
              AND pp_sib.child_id <> %s
            ORDER BY p.display_name
            """,
            (person_id, person_id),
        )
        siblings = [PersonOut.model_validate(r) for r in cur.fetchall()]

    # Query 3: children — reverse person_parents
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            SELECT {_person_cols}
            FROM person_parents pp
            JOIN persons p ON p.id = pp.child_id
            WHERE pp.parent_id = %s
            ORDER BY p.birth_year NULLS LAST, p.display_name
            """,
            (person_id,),
        )
        children = [PersonOut.model_validate(r) for r in cur.fetchall()]

    return RelationsResponse(
        parents=parents,
        spouse=spouse,
        siblings=siblings,
        children=children,
    )


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


def get_person_events(conn: Connection, person_id: uuid.UUID) -> list[EventOut]:
    """Retorna eventos onde a pessoa e primaria ou relacionada."""
    # 404 se a pessoa não existir / RLS bloquear.
    get_person(conn, person_id)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT e.id, e.tree_id, e.person_id, e.union_id,
                   e.type, e.custom_label,
                   e.year, e.month, e.day, e.place, e.description,
                   e.created_at,
                   COALESCE(
                       array_agg(ep.person_id ORDER BY ep.person_id)
                           FILTER (WHERE ep.person_id IS NOT NULL),
                       ARRAY[]::uuid[]
                   ) AS related_person_ids
            FROM events e
            LEFT JOIN event_people ep ON ep.event_id = e.id
            WHERE e.person_id = %s
               OR EXISTS (
                   SELECT 1
                   FROM event_people ep_filter
                   WHERE ep_filter.event_id = e.id
                     AND ep_filter.person_id = %s
               )
            GROUP BY e.id
            ORDER BY e.year NULLS LAST, e.month NULLS LAST, e.day NULLS LAST, e.id ASC
            """,
            (person_id, person_id),
        )
        return [EventOut.model_validate(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


def _make_media_out(row: dict) -> MediaOut:
    """Converte row do banco em MediaOut.

    download_url e sempre None nas listagens de mídia (get_person_media etc.).
    Para obter a signed URL, o cliente deve chamar o endpoint dedicado
    `GET /api/media/{id}/download-url` (implementado em app/routers/media.py).
    Integrar a signed URL diretamente no MediaOut listado e deliberadamente
    pendente (Issue futura) — geraria N chamadas ao Supabase Storage por
    listagem, com TTL curto, o que nao escala bem.
    """
    out = MediaOut.model_validate(row)
    out = out.model_copy(update={"download_url": None})
    return out


def get_person_media(conn: Connection, person_id: uuid.UUID) -> list[MediaOut]:
    """Retorna mídias vinculadas à pessoa via person_media JOIN media."""
    get_person(conn, person_id)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                m.id, m.tree_id, m.kind, m.storage_path,
                m.mime_type, m.size_bytes, m.title, m.description,
                m.taken_year, m.taken_month, m.taken_day, m.taken_place,
                m.uploaded_by, m.uploaded_at
            FROM person_media pm
            JOIN media m ON m.id = pm.media_id
            WHERE pm.person_id = %s
            ORDER BY pm.is_primary DESC, m.uploaded_at DESC
            """,
            (person_id,),
        )
        return [_make_media_out(r) for r in cur.fetchall()]


def link_media(
    conn: Connection,
    person_id: uuid.UUID,
    media_id: uuid.UUID,
    is_primary: bool,
) -> None:
    """Vincula mídia a pessoa; se is_primary=True atualiza persons.photo_media_id."""
    # Verifica existência da pessoa (404 / RLS).
    get_person(conn, person_id)

    with conn.cursor() as cur:
        if is_primary:
            cur.execute(
                "UPDATE person_media SET is_primary = FALSE WHERE person_id = %s AND media_id <> %s",
                (person_id, media_id),
            )
        cur.execute(
            """
            INSERT INTO person_media(person_id, media_id, is_primary)
            VALUES (%s, %s, %s)
            ON CONFLICT (person_id, media_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
            """,
            (person_id, media_id, is_primary),
        )
        if is_primary:
            cur.execute(
                "UPDATE persons SET photo_media_id = %s WHERE id = %s",
                (media_id, person_id),
            )


def unlink_media(
    conn: Connection,
    person_id: uuid.UUID,
    media_id: uuid.UUID,
) -> None:
    """Remove vínculo pessoa-mídia."""
    get_person(conn, person_id)

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM person_media WHERE person_id = %s AND media_id = %s",
            (person_id, media_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Media link not found")
        cur.execute(
            "UPDATE persons SET photo_media_id = NULL WHERE id = %s AND photo_media_id = %s",
            (person_id, media_id),
        )
