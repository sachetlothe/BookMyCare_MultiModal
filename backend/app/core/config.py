"""Application configuration loaded from environment variables / .env file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "BookMyCare API"
    environment: str = "development"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'bookmycare.db').as_posix()}"
    auto_migrate: bool = True  # run Alembic migrations on startup
    seed_knowledge: bool = True  # load curated WHO/CDC summaries on startup
    upload_dir: Path = BACKEND_DIR / "uploads"
    max_upload_mb: int = 15

    # Uploaded files are always encrypted (AES-256-GCM) before they are stored.
    # 32 random bytes, base64. Without it a development key file is created in backend/.keys/.
    file_encryption_key: str = ""
    storage_backend: str = "local"  # local (UPLOAD_DIR) | supabase (private Storage bucket)
    supabase_url: str = ""  # https://<project-ref>.supabase.co
    supabase_secret_key: str = ""  # server-only secret / service_role key; never put it in the frontend
    supabase_storage_bucket: str = "medical-files"
    # Patients can open/download their OWN originals (decrypted with their own key, which only
    # their sign-in unlocks). Set false to hide originals from patients too.
    allow_file_download: bool = True

    # Security. A random default is generated per process if unset; set a real
    # value in .env so tokens survive restarts.
    jwt_secret: str = Field(default="")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12

    # Failed-login limits inside a sliding window (429 + Retry-After once reached).
    login_max_failures: int = 5  # per email + client IP
    login_max_failures_per_ip: int = 20  # per client IP across all emails
    login_window_seconds: int = 15 * 60

    # Send Strict-Transport-Security. Enable only when the API is served over HTTPS.
    hsts_enabled: bool = False

    # Team statistics: groups smaller than this are shown as "<N" so no one can be singled out.
    stats_min_count: int = 5

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # AI providers. Order of preference; the first one with a key is used and
    # the rest are fallbacks. "mock" is always appended as the final fallback.
    ai_provider_order: str = "gemini,groq,openrouter"  # Gemini is the primary provider
    ai_force_mock: bool = False
    ai_timeout_seconds: float = 45.0
    ai_max_output_tokens: int = 4096  # Gemini 3 models spend part of this on internal reasoning
    # If true (default) a clearly-labelled template summary is shown when no real AI is
    # available. If false, the assessment shows "AI explanation unavailable" instead.
    ai_allow_mock_fallback: bool = True

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"  # stable, free tier, ~1s. On 2026-10-25: gemini-3.8-flash hung/503; gemini-3.6-flash free tier = 20 requests/day. gemini-2.0-flash is shut down. See ai.google.dev/gemini-api/docs/deprecations
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"  # llama-3.3-70b-versatile was retired by Groq on 2026-08-16
    openrouter_api_key: str = ""
    openrouter_model: str = ""  # set an explicit, currently-available model id to enable OpenRouter

    # Safety messaging (defaults are for India; change for your region)
    emergency_number: str = "112"
    crisis_line: str = "Tele-MANAS 14416 (India, 24x7 mental health helpline)"

    # Nearby facility search (OpenStreetMap). Only a rounded location (~1 km) is sent, never health data.
    facility_search_enabled: bool = True
    # Data sources tried in order. Nominatim answers in about a second; public Overpass servers are often
    # at capacity (measured 2026-11-03: 3 of 4 timed out, the 4th took ~23 s), so it is the fallback.
    facility_sources: str = "nominatim,overpass"
    # Overpass servers, tried in this order (comma-separated).
    overpass_urls: str = "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    # OSM usage policies require an identifying User-Agent; add a contact address for a public deployment.
    osm_user_agent: str = "BookMyCare/0.1 (educational prototype)"
    geocode_country_codes: str = "in"  # limit place-name search to these ISO countries (comma-separated; empty = worldwide)
    facility_max_radius_km: float = 25.0
    facility_searches_per_10min: int = 20  # per user; cached answers do not count

    # OCR
    tesseract_cmd: str = ""  # e.g. C:\\Program Files\\Tesseract-OCR\\tesseract.exe

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def facility_source_list(self) -> list[str]:
        return [x.strip().lower() for x in self.facility_sources.split(",") if x.strip()]

    @property
    def overpass_url_list(self) -> list[str]:
        return [u.strip() for u in self.overpass_urls.split(",") if u.strip()]

    @property
    def provider_order(self) -> list[str]:
        return [p.strip().lower() for p in self.ai_provider_order.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret or s.jwt_secret.startswith("change-me"):
        import logging
        import secrets

        logging.getLogger("bookmycare").warning(
            "JWT_SECRET is not set; using a random secret (logins will reset when the server restarts)."
        )
        s.jwt_secret = secrets.token_urlsafe(48)
    s.upload_dir.mkdir(parents=True, exist_ok=True)
    return s
