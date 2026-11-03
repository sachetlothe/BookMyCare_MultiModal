from __future__ import annotations

import pytest

from app.core.rate_limit import LoginLimiter, get_login_limiter


@pytest.fixture(autouse=True)
def _fresh_limiter():
    get_login_limiter().reset()
    yield
    get_login_limiter().reset()


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_repeated_wrong_passwords_are_blocked_with_429(client):
    client.post("/api/auth/register", json={"email": "brute@example.com", "full_name": "Brute Target", "password": "Password123"})
    limit = get_login_limiter().max_per_account
    for _ in range(limit):
        assert _login(client, "brute@example.com", "WrongPass123").status_code == 401
    blocked = _login(client, "BRUTE@example.com", "WrongPass123")
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    # Even the correct password is refused while locked, so guessing gains nothing.
    assert _login(client, "brute@example.com", "Password123").status_code == 429


def test_successful_login_clears_the_failure_count(client):
    client.post("/api/auth/register", json={"email": "forgetful@example.com", "full_name": "Forgetful User", "password": "Password123"})
    limit = get_login_limiter().max_per_account
    for _ in range(limit - 1):
        assert _login(client, "forgetful@example.com", "WrongPass123").status_code == 401
    assert _login(client, "forgetful@example.com", "Password123").status_code == 200
    for _ in range(limit - 1):
        assert _login(client, "forgetful@example.com", "WrongPass123").status_code == 401
    assert _login(client, "forgetful@example.com", "Password123").status_code == 200


def test_per_ip_cap_stops_spraying_many_accounts(client):
    limiter = get_login_limiter()
    for i in range(limiter.max_per_ip):
        assert _login(client, f"spray{i}@example.com", "WrongPass123").status_code == 401
    assert _login(client, "spray-new@example.com", "WrongPass123").status_code == 429


def test_limiter_window_expires(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: clock["t"])
    lim = LoginLimiter(max_per_account=2, max_per_ip=10, window_seconds=60)
    lim.record_failure("a@x.com", "1.1.1.1")
    lim.record_failure("a@x.com", "1.1.1.1")
    assert lim.retry_after("a@x.com", "1.1.1.1") == 60
    assert lim.retry_after("a@x.com", "2.2.2.2") == 0  # another network is not locked out
    clock["t"] += 61
    assert lim.retry_after("a@x.com", "1.1.1.1") == 0


def test_security_headers_on_api_responses(client):
    r = client.get("/api/system/status")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"
    assert "strict-transport-security" not in r.headers  # only when HSTS_ENABLED=true (HTTPS)


def test_security_headers_on_errors_and_downloads(client, auth, allow_download):
    assert client.get("/api/reports/999999", headers=auth).headers["x-content-type-options"] == "nosniff"
    assert client.get("/api/profile").headers["x-frame-options"] == "DENY"  # 401
    up = client.post("/api/reports", headers=auth, files={"file": ("n.txt", b"Hemoglobin 13 g/dL", "text/plain")}, data={"kind": "report"})
    d = client.get(f"/api/reports/{up.json()['id']}/file", headers=auth)
    assert d.status_code == 200
    assert d.headers["x-content-type-options"] == "nosniff"


def test_docs_page_still_loads_with_its_own_csp(client):
    r = client.get("/docs")
    assert r.status_code == 200
    assert "cdn.jsdelivr.net" in r.headers["content-security-policy"]
