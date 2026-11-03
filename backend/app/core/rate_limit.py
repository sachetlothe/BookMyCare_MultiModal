"""Small in-memory limiter for failed logins.

Failures are counted per (email, client IP) and per client IP inside a sliding window.
Keying on email + IP means an attacker cannot lock a victim out from another network,
while the per-IP cap still stops one client from spraying many accounts.

State lives in this process only: it resets on restart and is not shared between
several uvicorn workers. For a multi-worker deployment move it to Redis or the database.
"""
from __future__ import annotations

import math
import threading
import time
from collections import deque


class LoginLimiter:
    def __init__(self, max_per_account: int, max_per_ip: int, window_seconds: int) -> None:
        self.max_per_account = max_per_account
        self.max_per_ip = max_per_ip
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        q = self._hits.get(key)
        if q is None:
            return deque()
        while q and q[0] <= now - self.window:
            q.popleft()
        if not q:
            self._hits.pop(key, None)
        return q

    @staticmethod
    def _keys(email: str, ip: str) -> tuple[str, str]:
        return f"acct:{email.lower()}|{ip}", f"ip:{ip}"

    def retry_after(self, email: str, ip: str) -> int:
        """Seconds until another attempt is allowed; 0 if allowed now."""
        now = time.monotonic()
        acct, ipk = self._keys(email, ip)
        wait = 0.0
        with self._lock:
            for key, limit in ((acct, self.max_per_account), (ipk, self.max_per_ip)):
                q = self._recent(key, now)
                if len(q) >= limit:
                    wait = max(wait, q[len(q) - limit] + self.window - now)
        return math.ceil(wait) if wait > 0 else 0

    def record_failure(self, email: str, ip: str) -> None:
        now = time.monotonic()
        with self._lock:
            for key in self._keys(email, ip):
                self._recent(key, now)
                self._hits.setdefault(key, deque()).append(now)

    def record_success(self, email: str, ip: str) -> None:
        acct, _ = self._keys(email, ip)
        with self._lock:
            self._hits.pop(acct, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_limiter: LoginLimiter | None = None


def get_login_limiter() -> LoginLimiter:
    global _limiter
    if _limiter is None:
        from app.core.config import get_settings

        s = get_settings()
        _limiter = LoginLimiter(s.login_max_failures, s.login_max_failures_per_ip, s.login_window_seconds)
    return _limiter
