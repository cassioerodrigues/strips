from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import lifespan
from app.errors import register_exception_handlers
from app.routers import auth, events, media, members, parents, people, stats, trees, unions


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Stirps API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.get("/api/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(trees.router)
    app.include_router(members.router)
    app.include_router(people.router)
    app.include_router(parents.router)
    app.include_router(unions.router)
    app.include_router(events.router)
    app.include_router(media.router)
    app.include_router(stats.router)

    return app


app = create_app()
