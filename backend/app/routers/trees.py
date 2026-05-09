"""trees.py — router de árvores genealógicas (/api/trees)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from psycopg import Connection

from app.auth import Claims
from app.deps import get_current_user, get_db_authenticated
from app.schemas.tree import TreeCreate, TreeOut, TreeUpdate
from app.services.trees import (
    create_tree,
    delete_tree,
    get_tree,
    list_user_trees,
    update_tree,
)

router = APIRouter(prefix="/api/trees", tags=["trees"])


@router.get("", response_model=list[TreeOut])
def list_trees(
    conn: Connection = Depends(get_db_authenticated),
) -> list[TreeOut]:
    """Lista árvores acessíveis ao usuário autenticado. Retorna [] se não houver nenhuma."""
    return list_user_trees(conn)


@router.post("", response_model=TreeOut, status_code=status.HTTP_201_CREATED)
def create_tree_endpoint(
    payload: TreeCreate,
    user: Claims = Depends(get_current_user),
    conn: Connection = Depends(get_db_authenticated),
) -> TreeOut:
    """Cria árvore e insere o usuário como owner numa transação atômica."""
    return create_tree(conn, user.sub, payload)


@router.get("/{tree_id}", response_model=TreeOut)
def get_tree_endpoint(
    tree_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> TreeOut:
    """Retorna detalhe de uma árvore. 404 se não existir ou sem acesso."""
    return get_tree(conn, tree_id)


@router.patch("/{tree_id}", response_model=TreeOut)
def update_tree_endpoint(
    tree_id: uuid.UUID,
    payload: TreeUpdate,
    conn: Connection = Depends(get_db_authenticated),
) -> TreeOut:
    """Atualiza nome e/ou descrição de uma árvore (owner only via RLS)."""
    return update_tree(conn, tree_id, payload)


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tree_endpoint(
    tree_id: uuid.UUID,
    conn: Connection = Depends(get_db_authenticated),
) -> None:
    """Remove uma árvore e todo o seu conteúdo (owner only via RLS)."""
    delete_tree(conn, tree_id)
