from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from access import require_admin
from auth import current_manager
from database import get_db_session
from db_models import ManagerRecord, SessionRecord
from models import AdminManager, ManagerRoleUpdate


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/managers", response_model=list[AdminManager])
async def list_managers(
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    require_admin(manager)
    result = await db.execute(
        select(
            ManagerRecord,
            func.count(SessionRecord.id).label("session_count"),
        )
        .outerjoin(SessionRecord, SessionRecord.manager_id == ManagerRecord.id)
        .group_by(ManagerRecord.id)
        .order_by(ManagerRecord.created_at.desc())
    )
    return [
        AdminManager(
            id=row.id,
            email=row.email,
            full_name=row.full_name,
            role=row.role or "manager",
            created_at=row.created_at,
            google_linked=bool(row.google_sub),
            session_count=session_count or 0,
        )
        for row, session_count in result.all()
    ]


@router.patch("/managers/{manager_id}/role", response_model=AdminManager)
async def update_manager_role(
    manager_id: int,
    body: ManagerRoleUpdate,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    require_admin(manager)
    target = await db.scalar(select(ManagerRecord).where(ManagerRecord.id == manager_id))
    if not target:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    target.role = body.role
    await db.commit()
    await db.refresh(target)
    session_count = await db.scalar(
        select(func.count(SessionRecord.id)).where(SessionRecord.manager_id == target.id)
    )
    return AdminManager(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role or "manager",
        created_at=target.created_at,
        google_linked=bool(target.google_sub),
        session_count=session_count or 0,
    )
