import json
from typing import Iterator

from fastapi import Depends, Header, HTTPException, status
from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.auth import Claims, decode_jwt
from app.config import get_settings
from app.db import get_pool


def get_current_user(
    authorization: str | None = Header(default=None),
) -> Claims:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[len("Bearer "):]
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_JWT_SECRET not configured",
        )
    return decode_jwt(token, settings.supabase_jwt_secret)


def get_db_authenticated(
    user: Claims = Depends(get_current_user),
    pool: ConnectionPool = Depends(get_pool),
) -> Iterator[Connection]:
    """Yield a Postgres connection with the user's JWT claims set.

    `SET LOCAL` is scoped to the transaction, so role and claims revert
    automatically when the transaction ends (commit on normal exit,
    rollback on exception). RLS policies that call `auth.uid()` will
    return the user's UUID inside this block.
    """
    claims = json.dumps({"sub": str(user.sub), "role": "authenticated"})
    with pool.connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SET LOCAL ROLE authenticated")
                cur.execute('SET LOCAL "request.jwt.claims" = %s', (claims,))
            yield conn
