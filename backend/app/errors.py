"""Global exception handlers.

Maps Postgres / RLS exceptions to HTTP responses so routers can stay
free of try/except clutter. Per-router 404s are still raised explicitly
via `HTTPException(404)` when a SELECT returns 0 rows — RLS makes
"forbidden" and "not found" indistinguishable on read paths, so we
collapse both into 404 there.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg import errors as pg_errors

from app.config import get_settings

log = logging.getLogger("stirps.errors")


def _json(status: int, message: str, code: str | None = None) -> JSONResponse:
    body: dict = {"detail": message}
    if code:
        body["code"] = code
    return JSONResponse(status_code=status, content=body)


async def _insufficient_privilege(request: Request, exc: Exception) -> JSONResponse:
    return _json(403, "Insufficient privilege for this operation", "insufficient_privilege")


async def _rls_raise(request: Request, exc: Exception) -> JSONResponse:
    return _json(403, "Operation blocked by row-level security", "rls_denied")


async def _unique_violation(request: Request, exc: Exception) -> JSONResponse:
    return _json(409, "Resource already exists", "unique_violation")


async def _foreign_key_violation(request: Request, exc: Exception) -> JSONResponse:
    return _json(409, "Referenced resource missing or in use", "foreign_key_violation")


async def _check_violation(request: Request, exc: Exception) -> JSONResponse:
    return _json(422, "Constraint check failed", "check_violation")


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return _json(500, "Internal server error")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(pg_errors.InsufficientPrivilege, _insufficient_privilege)
    app.add_exception_handler(pg_errors.RaiseException, _rls_raise)
    app.add_exception_handler(pg_errors.UniqueViolation, _unique_violation)
    app.add_exception_handler(pg_errors.ForeignKeyViolation, _foreign_key_violation)
    app.add_exception_handler(pg_errors.CheckViolation, _check_violation)

    if get_settings().app_env == "production":
        app.add_exception_handler(Exception, _unhandled)
