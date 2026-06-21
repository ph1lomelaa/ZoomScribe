import os
import secrets
from urllib.parse import urlencode

import httpx
from anyio.to_thread import run_sync
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    COOKIE_NAME,
    DUMMY_PASSWORD_HASH,
    GOOGLE_OAUTH_STATE_COOKIE,
    GOOGLE_OAUTH_NEXT_COOKIE,
    clear_login_session,
    clear_oauth_state_cookie,
    create_login_session,
    current_manager,
    frontend_url,
    google_redirect_uri,
    hash_password,
    normalize_email,
    normalize_next_path,
    set_oauth_next_cookie,
    set_oauth_state_cookie,
    should_be_admin,
    verify_password,
)
from database import get_db_session, now_iso
from db_models import ManagerRecord
from models import LoginRequest, Manager, RegisterRequest


router = APIRouter(prefix="/api/auth", tags=["auth"])


def manager_view(manager: ManagerRecord) -> Manager:
    return Manager(
        id=manager.id,
        email=manager.email,
        full_name=manager.full_name,
        role=manager.role or "manager",
    )


async def ensure_admin_role(db, manager: ManagerRecord) -> None:
    if should_be_admin(manager.email) and manager.role != "admin":
        manager.role = "admin"
        await db.commit()
        await db.refresh(manager)


async def upsert_google_manager(db, profile: dict) -> ManagerRecord:
    email = normalize_email(profile["email"])
    google_sub = profile["sub"]
    full_name = (profile.get("name") or email.split("@", 1)[0]).strip()[:160]

    manager = await db.scalar(select(ManagerRecord).where(ManagerRecord.google_sub == google_sub))
    if not manager:
        manager = await db.scalar(select(ManagerRecord).where(ManagerRecord.email == email))

    if manager:
        manager.google_sub = google_sub
        if full_name and manager.full_name != full_name:
            manager.full_name = full_name
        if should_be_admin(email) and manager.role != "admin":
            manager.role = "admin"
        await db.commit()
        await db.refresh(manager)
        return manager

    if os.getenv("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(status_code=403, detail="Регистрация отключена администратором")

    manager = ManagerRecord(
        email=email,
        full_name=full_name,
        password_hash=None,
        role="admin" if should_be_admin(email) else "manager",
        google_sub=google_sub,
        created_at=now_iso(),
    )
    db.add(manager)
    await db.commit()
    await db.refresh(manager)
    return manager


@router.post("/register", response_model=Manager, status_code=201)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    if os.getenv("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(status_code=403, detail="Регистрация отключена администратором")
    email = normalize_email(body.email)
    try:
        existing = await db.scalar(select(ManagerRecord).where(ManagerRecord.email == email))
        if existing:
            raise HTTPException(status_code=409, detail="Этот email уже зарегистрирован")
        manager = ManagerRecord(
            email=email,
            full_name=body.full_name.strip(),
            password_hash=await run_sync(hash_password, body.password),
            role="admin" if should_be_admin(email) else "manager",
            created_at=now_iso(),
        )
        db.add(manager)
        await db.flush()
        await create_login_session(db, manager.id, response)
        return manager_view(manager)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Этот email уже зарегистрирован")


@router.post("/login", response_model=Manager)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    email = normalize_email(body.email)
    manager = await db.scalar(select(ManagerRecord).where(ManagerRecord.email == email))
    # Always run the scrypt check, even for a missing account or a Google-only
    # account with no password_hash, so the response time doesn't leak whether
    # the email is registered.
    stored_hash = (manager.password_hash if manager else None) or DUMMY_PASSWORD_HASH
    password_is_valid = await run_sync(verify_password, body.password, stored_hash)
    if not manager or not manager.password_hash or not password_is_valid:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    await ensure_admin_role(db, manager)
    await create_login_session(db, manager.id, response)
    return manager_view(manager)


@router.get("/google/start")
async def google_start(next: str = Query(default="/")):
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    redirect_uri = google_redirect_uri()
    if not client_id or not os.getenv("GOOGLE_CLIENT_SECRET", "").strip():
        raise HTTPException(status_code=503, detail="Google OAuth не настроен на сервере")

    next_path = normalize_next_path(next)
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(
        url="https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
            "state": state,
            "include_granted_scopes": "true",
        }),
        status_code=302,
    )
    set_oauth_state_cookie(response, state)
    set_oauth_next_cookie(response, next_path)
    return response


async def exchange_google_code(code: str) -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = google_redirect_uri()
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth не настроен на сервере")

    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code >= 400:
            raise HTTPException(status_code=401, detail="Не удалось подтвердить вход через Google")
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="Google не вернул access token")

        userinfo_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_response.status_code >= 400:
            raise HTTPException(status_code=401, detail="Не удалось получить профиль Google")
        profile = userinfo_response.json()

    if not profile.get("email") or not profile.get("sub"):
        raise HTTPException(status_code=401, detail="Google аккаунт не вернул email")
    if not profile.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Email Google аккаунта не подтверждён")
    allowed_domains = {domain.strip().lower() for domain in os.getenv("GOOGLE_ALLOWED_DOMAINS", "").split(",") if domain.strip()}
    if allowed_domains:
        domain = profile["email"].split("@")[-1].lower()
        if domain not in allowed_domains:
            raise HTTPException(status_code=403, detail="Этот домен не разрешён для входа")
    return profile


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
    db: AsyncSession = Depends(get_db_session),
):
    oauth_state = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)
    next_path = normalize_next_path(request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE))
    if not code or not state or not oauth_state:
        raise HTTPException(status_code=400, detail="Некорректный OAuth callback")
    if oauth_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    profile = await exchange_google_code(code)
    manager = await upsert_google_manager(db, profile)
    response = RedirectResponse(frontend_url(next_path), status_code=302)
    await create_login_session(db, manager.id, response)

    clear_oauth_state_cookie(response)
    return response


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    zoomscribe_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    await clear_login_session(db, zoomscribe_session, response)


@router.get("/me", response_model=Manager)
async def me(manager: ManagerRecord = Depends(current_manager)):
    return manager_view(manager)
