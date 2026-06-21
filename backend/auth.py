import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db_session, now_iso
from db_models import AuthSessionRecord, ManagerRecord


COOKIE_NAME = "zoomscribe_session"
GOOGLE_OAUTH_STATE_COOKIE = "zoomscribe_google_oauth_state"
GOOGLE_OAUTH_NEXT_COOKIE = "zoomscribe_google_oauth_next"
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(email: str) -> str:
    value = email.strip().lower()
    if len(value) > 320 or not EMAIL_RE.match(value):
        raise HTTPException(status_code=422, detail="Укажите корректный email")
    return value


def _scrypt_maxmem(n: int, r: int, p: int) -> int:
    # OpenSSL's scrypt defaults to a 32 MiB cap regardless of N/r/p; without an
    # explicit maxmem, hashing or verifying with stronger parameters raises
    # ValueError, which verify_password's except clause would silently turn
    # into "wrong password" instead of a clear failure.
    return 128 * n * r * p + 16 * 1024 * 1024


def hash_password(password: str) -> str:
    n, r, p = 2**15, 8, 2
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=n, r=r, p=p, dklen=32, maxmem=_scrypt_maxmem(n, r, p),
    )
    return f"scrypt${n}${r}${p}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        _, n, r, p, salt_hex, digest_hex = encoded.split("$")
        n, r, p = int(n), int(r), int(p)
        candidate = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=n,
            r=r,
            p=p,
            dklen=32,
            maxmem=_scrypt_maxmem(n, r, p),
        )
        return secrets.compare_digest(candidate, bytes.fromhex(digest_hex))
    except (ValueError, TypeError):
        return False


# Verified on every login attempt, even when the email doesn't exist or belongs
# to a Google-only account, so response time can't be used to enumerate accounts.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "false").lower() == "true"


def frontend_url(path: str = "/") -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}"


def google_redirect_uri() -> str:
    value = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if value:
        return value
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/api/auth/google/callback"


def admin_email_set() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {normalize_email(item) for item in raw.split(",") if item.strip()}


def should_be_admin(email: str) -> bool:
    return normalize_email(email) in admin_email_set()


def normalize_next_path(next_path: str | None) -> str:
    if not next_path:
        return "/"
    cleaned = next_path.strip()
    if not cleaned:
        return "/"
    if cleaned.startswith(("http://", "https://", "//")):
        return "/"
    if not cleaned.startswith("/"):
        cleaned = f"/{cleaned}"
    return cleaned


async def create_login_session(db: AsyncSession, manager_id: int, response: Response) -> None:
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    db.add(
        AuthSessionRecord(
            token_hash=_token_hash(token),
            manager_id=manager_id,
            created_at=now_iso(),
            expires_at=expires.isoformat(),
        )
    )
    await db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/",
    )


async def clear_login_session(db: AsyncSession, token: str | None, response: Response) -> None:
    if token:
        await db.execute(delete(AuthSessionRecord).where(AuthSessionRecord.token_hash == _token_hash(token)))
        await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


def set_oauth_state_cookie(response: Response, state: str) -> None:
    response.set_cookie(
        GOOGLE_OAUTH_STATE_COOKIE,
        state,
        max_age=10 * 60,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/api/auth/google",
    )


def set_oauth_next_cookie(response: Response, next_path: str) -> None:
    response.set_cookie(
        GOOGLE_OAUTH_NEXT_COOKIE,
        next_path,
        max_age=10 * 60,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/api/auth/google",
    )


def clear_oauth_state_cookie(response: Response) -> None:
    response.delete_cookie(GOOGLE_OAUTH_STATE_COOKIE, path="/api/auth/google")
    response.delete_cookie(GOOGLE_OAUTH_NEXT_COOKIE, path="/api/auth/google")


async def current_manager(
    request: Request,
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: AsyncSession = Depends(get_db_session),
) -> ManagerRecord:
    token = session_token
    auth_header = request.headers.get("Authorization", "")
    if not token and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется вход")

    result = await db.execute(
        select(ManagerRecord)
        .join(AuthSessionRecord, AuthSessionRecord.manager_id == ManagerRecord.id)
        .where(
            AuthSessionRecord.token_hash == _token_hash(token),
            AuthSessionRecord.expires_at > now_iso(),
        )
    )
    manager = result.scalar_one_or_none()
    if not manager:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия истекла")
    if should_be_admin(manager.email) and manager.role != "admin":
        manager.role = "admin"
        await db.commit()
        await db.refresh(manager)
    return manager


CurrentManager = Depends(current_manager)
