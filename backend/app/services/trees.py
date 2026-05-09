"""trees.py — serviços de banco para árvores genealógicas e perfil do usuário.

Usa SQL bruto via psycopg com dict_row para validação com Pydantic.
A conexão já está numa transação com SET LOCAL request.jwt.claims configurado
pelo get_db_authenticated de deps.py — RLS é aplicado automaticamente.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.auth import MeResponse, ProfileOut, TreeMembershipOut
from app.schemas.tree import TreeCreate, TreeOut, TreeUpdate


# ---------------------------------------------------------------------------
# Profile + Me
# ---------------------------------------------------------------------------


def get_me(conn: Connection, user_sub: uuid.UUID) -> MeResponse:
    """Retorna profile + lista de árvores onde o usuário é membro."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, display_name, avatar_url, locale, created_at, updated_at
            FROM profiles
            WHERE id = %s
            """,
            (user_sub,),
        )
        profile_row = cur.fetchone()

    if profile_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    profile = ProfileOut.model_validate(profile_row)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                tm.role,
                tm.joined_at,
                t.id          AS tree_id,
                t.owner_id    AS tree_owner_id,
                t.name        AS tree_name,
                t.description AS tree_description,
                t.created_at  AS tree_created_at,
                t.updated_at  AS tree_updated_at
            FROM tree_members tm
            JOIN trees t ON t.id = tm.tree_id
            WHERE tm.user_id = %s
            ORDER BY tm.joined_at DESC
            """,
            (user_sub,),
        )
        rows = cur.fetchall()

    memberships: list[TreeMembershipOut] = []
    for row in rows:
        tree = TreeOut(
            id=row["tree_id"],
            owner_id=row["tree_owner_id"],
            name=row["tree_name"],
            description=row["tree_description"],
            created_at=row["tree_created_at"],
            updated_at=row["tree_updated_at"],
        )
        memberships.append(
            TreeMembershipOut(
                tree=tree,
                role=row["role"],
                joined_at=row["joined_at"],
            )
        )

    return MeResponse(profile=profile, trees=memberships)


# ---------------------------------------------------------------------------
# Trees CRUD
# ---------------------------------------------------------------------------


def list_user_trees(conn: Connection) -> list[TreeOut]:
    """Lista árvores acessíveis ao usuário autenticado (RLS filtra automaticamente)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, owner_id, name, description, created_at, updated_at
            FROM trees
            ORDER BY created_at DESC
            """
        )
        return [TreeOut.model_validate(r) for r in cur.fetchall()]


def create_tree(
    conn: Connection, user_sub: uuid.UUID, payload: TreeCreate
) -> TreeOut:
    """Cria árvore e insere o criador como owner numa transação atômica."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO trees (owner_id, name, description)
            VALUES (%s, %s, %s)
            RETURNING id, owner_id, name, description, created_at, updated_at
            """,
            (user_sub, payload.name, payload.description),
        )
        tree_row = cur.fetchone()
        assert tree_row is not None  # RETURNING sempre retorna se INSERT ok

        cur.execute(
            """
            INSERT INTO tree_members (tree_id, user_id, role)
            VALUES (%s, %s, 'owner')
            """,
            (tree_row["id"], user_sub),
        )

    return TreeOut.model_validate(tree_row)


def get_tree(conn: Connection, tree_id: uuid.UUID) -> TreeOut:
    """Retorna detalhe de uma árvore; 404 se não existir ou sem acesso (RLS)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, owner_id, name, description, created_at, updated_at
            FROM trees
            WHERE id = %s
            """,
            (tree_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")

    return TreeOut.model_validate(row)


def update_tree(
    conn: Connection, tree_id: uuid.UUID, payload: TreeUpdate
) -> TreeOut:
    """Atualiza nome e/ou descrição de uma árvore (owner only via RLS)."""
    fields = payload.model_dump(exclude_unset=True)
    allowed = {"name", "description"}
    valid_fields = {k: v for k, v in fields.items() if k in allowed}

    if not valid_fields:
        # Nada a atualizar — retorna estado atual
        return get_tree(conn, tree_id)

    set_clauses = [f"{k} = %s" for k in valid_fields]
    sql = (
        f"UPDATE trees SET {', '.join(set_clauses)}, updated_at = now() "
        f"WHERE id = %s "
        f"RETURNING id, owner_id, name, description, created_at, updated_at"
    )
    params = [*valid_fields.values(), tree_id]

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")

    return TreeOut.model_validate(row)


def delete_tree(conn: Connection, tree_id: uuid.UUID) -> None:
    """Remove uma árvore (owner only via RLS); cascade derruba tudo."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM trees WHERE id = %s", (tree_id,))
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tree not found")
