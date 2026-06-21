import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routes.sessions import router as sessions_router
from routes.notes import router as notes_router
from routes.auth import router as auth_router
from routes.integrations import router as integrations_router
from routes.admin import router as admin_router


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ZoomScribe API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(notes_router)
app.include_router(auth_router)
app.include_router(integrations_router)
app.include_router(admin_router)


@app.get("/api/health")
async def health():
    groq_key = os.getenv("GROQ_API_KEY", "")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    provider = "groq" if groq_key else ("anthropic" if anthropic_key else "demo")
    return {
        "status": "ok",
        "provider": provider,
        "api_key_set": bool(groq_key or anthropic_key),
        "deepgram_set": bool(os.getenv("DEEPGRAM_API_KEY", "")),
    }
