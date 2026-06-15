import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routes.sessions import router as sessions_router
from routes.notes import router as notes_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ZoomScribe API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(notes_router)


@app.get("/api/health")
async def health():
    groq_key = os.getenv("GROQ_API_KEY", "")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    provider = "groq" if groq_key else ("anthropic" if anthropic_key else "demo")
    return {"status": "ok", "provider": provider, "api_key_set": bool(groq_key or anthropic_key)}
