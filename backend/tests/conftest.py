from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="bmc-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["AI_FORCE_MOCK"] = "true"
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["FILE_ENCRYPTION_KEY"] = "dGVzdC1rZXktMzItYnl0ZXMtZm9yLWFlcy1nY20tISE="  # test-only, 32 bytes
os.environ["STORAGE_BACKEND"] = "local"
os.environ["ALLOW_FILE_DOWNLOAD"] = "true"
for k in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"):
    os.environ[k] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

SAMPLES = Path(__file__).resolve().parents[1] / "sample_data"


@pytest.fixture
def allow_download(monkeypatch):
    """Let patients download their originals for this test (ALLOW_FILE_DOWNLOAD=true)."""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "allow_file_download", True)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
    shutil.rmtree(_TMP, ignore_errors=True)


_counter = {"n": 0}


@pytest.fixture
def auth(client):
    """Register a fresh user and return auth headers."""
    _counter["n"] += 1
    r = client.post("/api/auth/register", json={
        "email": f"user{_counter['n']}@example.com", "full_name": "Test User", "password": "Password123",
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def upload(client, headers, filename, kind="report", **form):
    with open(SAMPLES / filename, "rb") as f:
        return client.post("/api/reports", headers=headers, files={"file": (filename, f)}, data={"kind": kind, **form})
