from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bookmycare")

_DOCS_PATHS = {"/docs", "/docs/oauth2-redirect", "/redoc"}
_DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "img-src 'self' data: https://fastapi.tiangolo.com; font-src 'self' https://fonts.gstatic.com; "
    "worker-src 'self' blob:; frame-ancestors 'none'"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if s.auto_migrate:
        from app.db.migrate import upgrade_head

        upgrade_head()
    from app.db.session import SessionLocal
    from app.services.lab_catalog import ensure_catalog

    with SessionLocal() as db:
        ensure_catalog(db)  # keep lab_test_catalog in step with the parser's test list
        db.commit()
    if s.seed_knowledge:
        from app.services.retrieval import seed_curated

        with SessionLocal() as db:
            n = seed_curated(db)
            if n:
                log.info("Seeded %d curated WHO/CDC documents", n)
    from app.ai.registry import status

    st = status()
    log.info("AI provider: %s%s", st["active_provider"], " (MOCK MODE - no API keys configured)" if st["mock_mode"] else "")
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.app_name, version="0.1.0", lifespan=lifespan)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        # Registered last, so it is the outermost middleware and also covers CORS and error responses.
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "no-referrer")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        path = request.url.path
        if path in _DOCS_PATHS:
            # Swagger UI / ReDoc load their scripts and styles from a CDN.
            h.setdefault("Content-Security-Policy", _DOCS_CSP)
        else:
            # The API only returns JSON and file downloads: nothing may run or be framed.
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        if path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")  # health data must not sit in shared caches
        if s.hsts_enabled:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError):
        errors = []
        for e in exc.errors():
            loc = ".".join(str(x) for x in e.get("loc", []) if x not in ("body", "query", "path"))
            errors.append({"field": loc, "message": e.get("msg", "Invalid value").removeprefix("Value error, ")})
        msg = "; ".join(f"{e['field']}: {e['message']}" if e["field"] else e["message"] for e in errors)
        return JSONResponse(status_code=422, content={"detail": msg or "Invalid request", "errors": errors})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # pragma: no cover - safety net
        log.exception("Unhandled error")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.include_router(api_router)
    return app


app = create_app()
