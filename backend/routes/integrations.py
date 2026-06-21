import os

import httpx
from fastapi import APIRouter, Depends, HTTPException

from auth import current_manager
from db_models import ManagerRecord


router = APIRouter(prefix="/api/integrations", tags=["integrations"])


async def request_deepgram_grant(api_key: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            "https://api.deepgram.com/v1/auth/grant",
            headers={"Authorization": f"Token {api_key}"},
            json={"ttl_seconds": 60},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Deepgram отклонил серверный ключ")
    return response.json()


@router.post("/deepgram/token")
async def deepgram_token(_manager: ManagerRecord = Depends(current_manager)):
    api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Deepgram не настроен на сервере")
    try:
        payload = await request_deepgram_grant(api_key)
        return {"access_token": payload["access_token"], "expires_in": payload["expires_in"]}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Deepgram временно недоступен") from exc
