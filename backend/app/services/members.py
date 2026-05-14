"""members.py — serviços de banco para tree_members (Issue #13).

A conexão já está numa transação com SET LOCAL request.jwt.claims configurado
por get_db_authenticated em deps.py — RLS aplica-se automaticamente:

  - SELECT em tree_members é permitido a qualquer membro da árvore.
  - INSERT/UPDATE/DELETE só passam se tree_role(tree_id) = 'owner'.

Erros do Postgres (InsufficientPrivilege, RaiseException, …) sobem para os
handlers globais em app/errors.py — não os capturamos aqui.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row

from app.schemas.member import MemberInvite, MemberOut, MemberSetPerson, MemberUpdate


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def list_members(conn: Connection, tree_id: uuid.UUID) -> list[MemberOut]:
    """Lista membros de uma árvore com dados de profile (JOIN tree_members + profiles).

    RLS filtra automaticamente: se o caller não é membro da árvore, retorna [].
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                tm.user_id      AS user_id,
                p.display_name  AS display_name,
                p.avatar_url    AS avatar_url,
                tm.role         AS role,
                tm.joined_at    AS joined_at,
                tm.person_id    AS person_id
            FROM tree_members tm
            JOIN profiles p ON p.id = tm.user_id
            WHERE tm.tree_id = %s
            ORDER BY tm.joined_at ASC
            """,
            (tree_id,),
        )
        return [MemberOut.model_validate(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Invite
# ---------------------------------------------------------------------------


def invite_member(
    conn: Connection,
    tree_id: uuid.UUID,
    inviter_sub: uuid.UUID,
    payload: MemberInvite,
) -> MemberOut:
    """Convida um usuário existente por email.

    Fluxo:
      1. `lookup_user_by_email` (security definer) resolve email → user_id.
         Só o owner consegue chamar essa função — non-owners recebem 403
         via InsufficientPrivilege bubble-up.
      2. Se não houver usuário com aquele email → 404.
      3. INSERT em tree_members com invited_by = inviter_sub. RLS reforça
         owner-only no INSERT também; UniqueViolation se já é membro.
    """
    # Resolver email → user_id. lookup_user_by_email garante owner-only.
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT public.lookup_user_by_email(%s, %s) AS user_id",
            (tree_id, payload.email),
        )
        row = cur.fetchone()
        target_user_id = row["user_id"] if row else None

    if target_user_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not registered yet")

    # INSERT — RLS valida owner-only de novo (defesa em profundidade).
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO tree_members (tree_id, user_id, role, invited_by)
            VALUES (%s, %s, %s, %s)
            RETURNING user_id, role, joined_at
            """,
            (tree_id, target_user_id, payload.role, inviter_sub),
        )
        inserted = cur.fetchone()
        assert inserted is not None

        cur.execute(
            """
            SELECT display_name, avatar_url
            FROM profiles
            WHERE id = %s
            """,
            (target_user_id,),
        )
        profile = cur.fetchone()

    # profile sempre existe: a trigger on_auth_user_created cria a linha.
    assert profile is not None

    return MemberOut(
        user_id=inserted["user_id"],
        display_name=profile["display_name"],
        avatar_url=profile["avatar_url"],
        role=inserted["role"],
        joined_at=inserted["joined_at"],
        person_id=inserted.get("person_id"),
    )


# ---------------------------------------------------------------------------
# Update role
# ---------------------------------------------------------------------------


def update_member_role(
    conn: Connection,
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    caller_sub: uuid.UUID,
    payload: MemberUpdate,
) -> MemberOut:
    """Altera o role de um membro. Owner-only via RLS.

    Guards explícitos:
      - Owner não pode rebaixar a si mesmo (400). A schema MemberUpdate já
        impede payload role='owner', mas mesmo assim travamos o caso em que
        o caller tenta mudar o próprio papel (alvo == caller).
    """
    if user_id == caller_sub:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Owner cannot demote themselves",
        )

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE tree_members
            SET role = %s
            WHERE tree_id = %s AND user_id = %s
            RETURNING user_id, role, joined_at, person_id
            """,
            (payload.role, tree_id, user_id),
        )
        updated = cur.fetchone()

    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT display_name, avatar_url FROM profiles WHERE id = %s",
            (user_id,),
        )
        profile = cur.fetchone()

    assert profile is not None

    return MemberOut(
        user_id=updated["user_id"],
        display_name=profile["display_name"],
        avatar_url=profile["avatar_url"],
        role=updated["role"],
        joined_at=updated["joined_at"],
        person_id=updated.get("person_id"),
    )


# ---------------------------------------------------------------------------
# Remove
# ---------------------------------------------------------------------------


def remove_member(
    conn: Connection,
    tree_id: uuid.UUID,
    user_id: uuid.UUID,
    caller_sub: uuid.UUID,
) -> None:
    """Remove um membro da árvore. Owner-only via RLS.

    Owner não pode se auto-remover (400) — transferência de ownership é fora
    do escopo desta issue (#13).
    """
    if user_id == caller_sub:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Owner cannot remove themselves; transfer ownership first",
        )

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM tree_members WHERE tree_id = %s AND user_id = %s",
            (tree_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")


# ---------------------------------------------------------------------------
# Set person_id (self-service: any member can set their own person)
# ---------------------------------------------------------------------------


def set_my_person(
    conn: Connection,
    tree_id: uuid.UUID,
    caller_sub: uuid.UUID,
    payload: MemberSetPerson,
) -> MemberOut:
    """Define qual person o usuário autenticado representa nesta árvore."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE tree_members
            SET person_id = %s
            WHERE tree_id = %s AND user_id = %s
            RETURNING user_id, role, joined_at, person_id
            """,
            (payload.person_id, tree_id, caller_sub),
        )
        updated = cur.fetchone()

    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not a member of this tree")

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT display_name, avatar_url FROM profiles WHERE id = %s",
            (caller_sub,),
        )
        profile = cur.fetchone()

    assert profile is not None

    return MemberOut(
        user_id=updated["user_id"],
        display_name=profile["display_name"],
        avatar_url=profile["avatar_url"],
        role=updated["role"],
        joined_at=updated["joined_at"],
        person_id=updated.get("person_id"),
    )
