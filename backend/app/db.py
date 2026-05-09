from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request, status
from psycopg_pool import ConnectionPool

from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    pool: ConnectionPool | None = None
    if settings.database_url:
        pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=10,
            open=False,
        )
        pool.open(wait=True, timeout=10)
    app.state.pool = pool
    try:
        yield
    finally:
        if pool is not None:
            pool.close()


def get_pool(request: Request) -> ConnectionPool:
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "DB pool not configured (set DATABASE_URL)",
        )
    return pool
