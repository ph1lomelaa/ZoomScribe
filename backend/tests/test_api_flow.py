import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select


TEST_DB_PATH = tempfile.mktemp(prefix="zoomscribe-api-test-", suffix=".db")
os.environ.pop("DATABASE_URL", None)
os.environ["DB_PATH"] = TEST_DB_PATH
os.environ["GROQ_API_KEY"] = ""
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ADMIN_EMAILS"] = "admin@example.com"
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/api/auth/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:5173"

from database import get_db, init_db  # noqa: E402
from db_models import ManagerRecord, NoteQuestionRecord, NoteRecord, TranscriptRecord  # noqa: E402
from main import app  # noqa: E402


class ApiFlowTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await init_db()
        transport = httpx.ASGITransport(app=app)
        self.manager_a = httpx.AsyncClient(transport=transport, base_url="http://test")
        self.manager_b = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.manager_a.aclose()
        await self.manager_b.aclose()

    async def test_manager_isolation_and_idempotent_transcript_flow(self):
        unauthorized = await self.manager_a.get("/api/sessions")
        self.assertEqual(unauthorized.status_code, 401)

        first = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Менеджер Один",
            "email": "one@example.com",
            "password": "strong-password-1",
        })
        second = await self.manager_b.post("/api/auth/register", json={
            "full_name": "Менеджер Два",
            "email": "two@example.com",
            "password": "strong-password-2",
        })
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)

        created, created_b = await asyncio.gather(
            self.manager_a.post("/api/sessions", json={
                "student_name": "Студент A", "country": "Казахстан",
                "country_flag": "🇰🇿", "zoom_link": "Первичная консультация",
            }),
            self.manager_b.post("/api/sessions", json={
                "student_name": "Студент B", "country": "Узбекистан",
                "country_flag": "🇺🇿", "zoom_link": "Повторная консультация",
            }),
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created_b.status_code, 201)
        session_id = created.json()["id"]

        foreign_session = await self.manager_b.get(f"/api/sessions/{session_id}")
        self.assertEqual(foreign_session.status_code, 404)
        manager_b_sessions = (await self.manager_b.get("/api/sessions")).json()
        self.assertEqual([item["student_name"] for item in manager_b_sessions], ["Студент B"])

        segment = {
            "text": "Документы нужно прислать до пятницы.",
            "speaker": "Спикер 1",
            "client_segment_id": "test-segment-1",
            "sequence_no": 0,
        }
        saved_once = await self.manager_a.post(
            f"/api/sessions/{session_id}/transcripts", json=segment,
        )
        saved_twice = await self.manager_a.post(
            f"/api/sessions/{session_id}/transcripts", json=segment,
        )
        self.assertEqual(saved_once.status_code, 201)
        self.assertEqual(saved_twice.status_code, 201)
        self.assertEqual(saved_once.json()["id"], saved_twice.json()["id"])

        detail = await self.manager_a.get(f"/api/sessions/{session_id}")
        self.assertEqual(len(detail.json()["transcripts"]), 1)

        ended = await self.manager_a.patch(
            f"/api/sessions/{session_id}/end", json={"duration_seconds": 1800},
        )
        self.assertEqual(ended.status_code, 200)

        generated = await self.manager_a.post(
            f"/api/sessions/{session_id}/notes/generate", json={},
        )
        self.assertEqual(generated.status_code, 200)
        final_detail = await self.manager_a.get(f"/api/sessions/{session_id}")
        note = final_detail.json()["note"]
        self.assertIsNotNone(note)

        answer = await self.manager_a.post(
            f"/api/notes/{note['id']}/questions",
            json={"question": "Когда нужно прислать документы?"},
        )
        self.assertEqual(answer.status_code, 200)

        admin = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Админ",
            "email": "admin@example.com",
            "password": "strong-password-3",
        })
        self.assertEqual(admin.status_code, 201)

        forbidden = await self.manager_b.get("/api/admin/managers")
        self.assertEqual(forbidden.status_code, 403)

        admin_managers = await self.manager_a.get("/api/admin/managers")
        self.assertEqual(admin_managers.status_code, 200)
        self.assertGreaterEqual(len(admin_managers.json()), 3)

        # Admin with no manager_id filter sees everyone's sessions ("Все" default).
        admin_all_sessions = await self.manager_a.get("/api/sessions")
        self.assertEqual(admin_all_sessions.status_code, 200)
        self.assertGreaterEqual(len(admin_all_sessions.json()), 2)

        promoted = await self.manager_a.patch(
            f"/api/admin/managers/{second.json()['id']}/role", json={"role": "admin"},
        )
        self.assertEqual(promoted.status_code, 200)
        self.assertEqual(promoted.json()["role"], "admin")

        google_profile = {
            "email": "admin@example.com",
            "sub": "google-sub-admin",
            "name": "Админ Google",
            "email_verified": True,
        }
        with patch("routes.auth.exchange_google_code", new=AsyncMock(return_value=google_profile)):
            start = await self.manager_b.get("/api/auth/google/start", params={"next": "/admin"})
            self.assertEqual(start.status_code, 302)
            oauth_state = start.cookies.get("zoomscribe_google_oauth_state")
            oauth_next = start.cookies.get("zoomscribe_google_oauth_next")
            self.assertIsNotNone(oauth_state)
            self.assertIsNotNone(oauth_next)
            self.manager_b.cookies.set(
                "zoomscribe_google_oauth_state",
                oauth_state,
                domain="test",
                path="/api/auth/google",
            )
            self.manager_b.cookies.set(
                "zoomscribe_google_oauth_next",
                oauth_next,
                domain="test",
                path="/api/auth/google",
            )

            callback = await self.manager_b.get(
                "/api/auth/google/callback",
                params={"code": "fake-google-code", "state": oauth_state},
            )
            self.assertEqual(callback.status_code, 302)
            self.assertEqual(callback.headers["location"], "http://localhost:5173/admin")

        me = await self.manager_b.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], "admin")

    async def test_concurrent_transcript_submission(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Конкурентный Менеджер",
            "email": "concurrent@example.com",
            "password": "strong-password-4",
        })
        self.assertEqual(register.status_code, 201)
        created = await self.manager_a.post("/api/sessions", json={
            "student_name": "Студент C", "country": "Кыргызстан",
            "country_flag": "🇰🇬", "zoom_link": "",
        })
        session_id = created.json()["id"]

        # Same client_segment_id submitted concurrently (e.g. two tabs racing a
        # retry) must dedupe to a single row instead of crashing on the unique
        # constraint between the lookup and the insert.
        duplicate_payload = {
            "text": "Повторяющийся сегмент", "speaker": "Спикер 1",
            "client_segment_id": "race-segment", "sequence_no": 0,
        }
        dup_first, dup_second = await asyncio.gather(
            self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json=duplicate_payload),
            self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json=duplicate_payload),
        )
        self.assertEqual(dup_first.status_code, 201)
        self.assertEqual(dup_second.status_code, 201)
        self.assertEqual(dup_first.json()["id"], dup_second.json()["id"])

        # Two distinct segments racing with the same client-supplied sequence_no
        # must both succeed with server-assigned, distinct sequence numbers.
        distinct_a, distinct_b = await asyncio.gather(
            self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json={
                "text": "Первый", "speaker": "Спикер 1", "client_segment_id": "seg-a", "sequence_no": 0,
            }),
            self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json={
                "text": "Второй", "speaker": "Спикер 2", "client_segment_id": "seg-b", "sequence_no": 0,
            }),
        )
        self.assertEqual(distinct_a.status_code, 201)
        self.assertEqual(distinct_b.status_code, 201)
        self.assertNotEqual(distinct_a.json()["sequence_no"], distinct_b.json()["sequence_no"])

        detail = await self.manager_a.get(f"/api/sessions/{session_id}")
        self.assertEqual(len(detail.json()["transcripts"]), 3)

    async def test_allow_registration_false_blocks_email_and_google_signup(self):
        os.environ["ALLOW_REGISTRATION"] = "false"
        try:
            blocked = await self.manager_a.post("/api/auth/register", json={
                "full_name": "Заблокированный",
                "email": "blocked-signup@example.com",
                "password": "strong-password-5",
            })
            self.assertEqual(blocked.status_code, 403)

            google_profile = {
                "email": "blocked-google@example.com",
                "sub": "google-sub-blocked",
                "name": "Blocked Google",
                "email_verified": True,
            }
            with patch("routes.auth.exchange_google_code", new=AsyncMock(return_value=google_profile)):
                start = await self.manager_a.get("/api/auth/google/start", params={"next": "/"})
                oauth_state = start.cookies.get("zoomscribe_google_oauth_state")
                self.manager_a.cookies.set(
                    "zoomscribe_google_oauth_state", oauth_state, domain="test", path="/api/auth/google",
                )
                self.manager_a.cookies.set(
                    "zoomscribe_google_oauth_next",
                    start.cookies.get("zoomscribe_google_oauth_next"),
                    domain="test", path="/api/auth/google",
                )
                callback = await self.manager_a.get(
                    "/api/auth/google/callback", params={"code": "fake-code", "state": oauth_state},
                )
                self.assertEqual(callback.status_code, 403)
        finally:
            os.environ["ALLOW_REGISTRATION"] = "true"

    async def test_role_update_requires_admin_role(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Обычный Менеджер",
            "email": "plain-manager@example.com",
            "password": "strong-password-6",
        })
        self.assertEqual(register.status_code, 201)
        manager_id = register.json()["id"]
        # A manager calling the role-update endpoint at all (even to "promote"
        # someone else, or themself) must be rejected before any role changes.
        forbidden = await self.manager_a.patch(
            f"/api/admin/managers/{manager_id}/role", json={"role": "admin"},
        )
        self.assertEqual(forbidden.status_code, 403)

        db = await get_db()
        try:
            stored_role = await db.scalar(
                select(ManagerRecord.role).where(ManagerRecord.id == manager_id)
            )
        finally:
            await db.close()
        self.assertEqual(stored_role, "manager")

    async def test_session_cookie_attributes(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Cookie Tester",
            "email": "cookie-test@example.com",
            "password": "strong-password-7",
        })
        self.assertEqual(register.status_code, 201)
        set_cookie = register.headers.get("set-cookie", "").lower()
        self.assertIn("httponly", set_cookie)
        self.assertIn("samesite=lax", set_cookie)
        self.assertNotIn("secure", set_cookie)  # COOKIE_SECURE=false in the test env

        os.environ["COOKIE_SECURE"] = "true"
        try:
            register_secure = await self.manager_b.post("/api/auth/register", json={
                "full_name": "Cookie Tester Secure",
                "email": "cookie-test-secure@example.com",
                "password": "strong-password-8",
            })
            secure_cookie = register_secure.headers.get("set-cookie", "").lower()
            self.assertIn("secure", secure_cookie)
        finally:
            os.environ["COOKIE_SECURE"] = "false"

    async def test_deepgram_token_endpoint(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Deepgram Tester",
            "email": "deepgram-test@example.com",
            "password": "strong-password-9",
        })
        self.assertEqual(register.status_code, 201)

        os.environ["DEEPGRAM_API_KEY"] = ""
        not_configured = await self.manager_a.post("/api/integrations/deepgram/token")
        self.assertEqual(not_configured.status_code, 503)

        os.environ["DEEPGRAM_API_KEY"] = "fake-key-for-test"
        try:
            # Mock the function that talks to Deepgram, not httpx.AsyncClient
            # itself — the test client (self.manager_a) is also an
            # httpx.AsyncClient, so patching the class method would intercept
            # our own requests to the app instead of just the outbound call.
            with patch(
                "routes.integrations.request_deepgram_grant",
                new=AsyncMock(return_value={"access_token": "fake-token", "expires_in": 60}),
            ):
                ok = await self.manager_a.post("/api/integrations/deepgram/token")
                self.assertEqual(ok.status_code, 200)
                self.assertEqual(ok.json()["access_token"], "fake-token")

            with patch(
                "routes.integrations.request_deepgram_grant",
                new=AsyncMock(side_effect=HTTPException(status_code=502, detail="Deepgram отклонил серверный ключ")),
            ):
                rejected = await self.manager_a.post("/api/integrations/deepgram/token")
                self.assertEqual(rejected.status_code, 502)
        finally:
            os.environ["DEEPGRAM_API_KEY"] = ""

    async def test_note_question_rate_limit(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Rate Limited",
            "email": "rate-limit@example.com",
            "password": "strong-password-10",
        })
        self.assertEqual(register.status_code, 201)
        created = await self.manager_a.post("/api/sessions", json={
            "student_name": "Студент D", "country": "Армения", "country_flag": "🇦🇲", "zoom_link": "",
        })
        session_id = created.json()["id"]
        await self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json={
            "text": "Тестовый сегмент", "client_segment_id": "rl-seg-1",
        })
        await self.manager_a.patch(f"/api/sessions/{session_id}/end", json={"duration_seconds": 60})
        generated = await self.manager_a.post(f"/api/sessions/{session_id}/notes/generate", json={})
        self.assertEqual(generated.status_code, 200)
        detail = await self.manager_a.get(f"/api/sessions/{session_id}")
        note_id = detail.json()["note"]["id"]

        with patch("routes.notes.NOTE_QUESTION_RATE_LIMIT", 2):
            first = await self.manager_a.post(f"/api/notes/{note_id}/questions", json={"question": "Вопрос один?"})
            second = await self.manager_a.post(f"/api/notes/{note_id}/questions", json={"question": "Вопрос два?"})
            third = await self.manager_a.post(f"/api/notes/{note_id}/questions", json={"question": "Вопрос три?"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)

    async def test_session_delete_cascades_child_rows(self):
        register = await self.manager_a.post("/api/auth/register", json={
            "full_name": "Cascade Tester",
            "email": "cascade-test@example.com",
            "password": "strong-password-11",
        })
        self.assertEqual(register.status_code, 201)
        created = await self.manager_a.post("/api/sessions", json={
            "student_name": "Студент E", "country": "Грузия", "country_flag": "🇬🇪", "zoom_link": "",
        })
        session_id = created.json()["id"]
        await self.manager_a.post(f"/api/sessions/{session_id}/transcripts", json={
            "text": "Сегмент для удаления", "client_segment_id": "cascade-seg-1",
        })
        await self.manager_a.patch(f"/api/sessions/{session_id}/end", json={"duration_seconds": 60})
        await self.manager_a.post(f"/api/sessions/{session_id}/notes/generate", json={})
        detail = await self.manager_a.get(f"/api/sessions/{session_id}")
        note_id = detail.json()["note"]["id"]
        await self.manager_a.post(f"/api/notes/{note_id}/questions", json={"question": "Тест?"})

        deleted = await self.manager_a.delete(f"/api/sessions/{session_id}")
        self.assertEqual(deleted.status_code, 200)

        db = await get_db()
        try:
            transcript_count = await db.scalar(
                select(func.count(TranscriptRecord.id)).where(TranscriptRecord.session_id == session_id)
            )
            note_count = await db.scalar(
                select(func.count(NoteRecord.id)).where(NoteRecord.session_id == session_id)
            )
            question_count = await db.scalar(
                select(func.count(NoteQuestionRecord.id)).where(NoteQuestionRecord.note_id == note_id)
            )
        finally:
            await db.close()
        self.assertEqual(transcript_count, 0)
        self.assertEqual(note_count, 0)
        self.assertEqual(question_count, 0)

    async def test_manager_id_filter_for_sessions_and_notes(self):
        admin_email = "filter-admin@example.com"
        os.environ["ADMIN_EMAILS"] = f"admin@example.com,{admin_email}"
        try:
            admin_register = await self.manager_a.post("/api/auth/register", json={
                "full_name": "Filter Admin", "email": admin_email, "password": "strong-password-12",
            })
            self.assertEqual(admin_register.status_code, 201)
            self.assertEqual(admin_register.json()["role"], "admin")
            admin_id = admin_register.json()["id"]

            manager_register = await self.manager_b.post("/api/auth/register", json={
                "full_name": "Filter Manager", "email": "filter-manager@example.com", "password": "strong-password-13",
            })
            self.assertEqual(manager_register.status_code, 201)
            manager_id = manager_register.json()["id"]

            admin_session = await self.manager_a.post("/api/sessions", json={
                "student_name": "Admin Own Student", "country": "Казахстан", "country_flag": "🇰🇿", "zoom_link": "",
            })
            manager_session = await self.manager_b.post("/api/sessions", json={
                "student_name": "Manager Student", "country": "Армения", "country_flag": "🇦🇲", "zoom_link": "",
            })
            admin_session_id = admin_session.json()["id"]
            manager_session_id = manager_session.json()["id"]

            # (1) manager fetches sessions -> only own.
            own_only = await self.manager_b.get("/api/sessions")
            self.assertEqual([s["id"] for s in own_only.json()], [manager_session_id])

            # (2) manager tries to fake admin access via manager_id (someone
            # else's id, or a nonsense id meant to mimic "give me everything")
            # -> backend ignores the param outright, still only their own.
            spoofed_other = await self.manager_b.get("/api/sessions", params={"manager_id": admin_session_id})
            self.assertEqual([s["id"] for s in spoofed_other.json()], [manager_session_id])
            spoofed_garbage = await self.manager_b.get("/api/sessions", params={"manager_id": 999999})
            self.assertEqual([s["id"] for s in spoofed_garbage.json()], [manager_session_id])

            # (3) admin selects "Свои" (manager_id = own id) -> only own.
            admin_own = await self.manager_a.get("/api/sessions", params={"manager_id": admin_id})
            self.assertEqual([s["id"] for s in admin_own.json()], [admin_session_id])

            # (4) admin selects "Все" (no manager_id) -> all, including own.
            admin_all = await self.manager_a.get("/api/sessions")
            all_ids = {s["id"] for s in admin_all.json()}
            self.assertIn(admin_session_id, all_ids)
            self.assertIn(manager_session_id, all_ids)

            # (5) admin selects the specific manager -> only that manager's sessions.
            admin_for_manager = await self.manager_a.get("/api/sessions", params={"manager_id": manager_id})
            self.assertEqual([s["id"] for s in admin_for_manager.json()], [manager_session_id])

            # Same five checks again, but for /api/notes.
            for client, session_id in ((self.manager_a, admin_session_id), (self.manager_b, manager_session_id)):
                await client.post(f"/api/sessions/{session_id}/transcripts", json={"text": "контент созвона"})
                await client.patch(f"/api/sessions/{session_id}/end", json={"duration_seconds": 30})
                generated = await client.post(f"/api/sessions/{session_id}/notes/generate", json={})
                self.assertEqual(generated.status_code, 200)

            manager_notes_own = await self.manager_b.get("/api/notes")
            self.assertEqual([n["session_id"] for n in manager_notes_own.json()], [manager_session_id])

            manager_notes_spoofed = await self.manager_b.get(
                "/api/notes", params={"manager_id": admin_id},
            )
            self.assertEqual([n["session_id"] for n in manager_notes_spoofed.json()], [manager_session_id])

            admin_notes_all = await self.manager_a.get("/api/notes")
            note_session_ids = {n["session_id"] for n in admin_notes_all.json()}
            self.assertIn(admin_session_id, note_session_ids)
            self.assertIn(manager_session_id, note_session_ids)

            admin_notes_own = await self.manager_a.get("/api/notes", params={"manager_id": admin_id})
            self.assertEqual([n["session_id"] for n in admin_notes_own.json()], [admin_session_id])

            admin_notes_for_manager = await self.manager_a.get(
                "/api/notes", params={"manager_id": manager_id},
            )
            self.assertEqual([n["session_id"] for n in admin_notes_for_manager.json()], [manager_session_id])
        finally:
            os.environ["ADMIN_EMAILS"] = "admin@example.com"

    async def test_admin_role_update_persists_in_db(self):
        admin_email = "role-update-admin@example.com"
        os.environ["ADMIN_EMAILS"] = f"admin@example.com,{admin_email}"
        try:
            admin_register = await self.manager_a.post("/api/auth/register", json={
                "full_name": "Role Update Admin", "email": admin_email, "password": "strong-password-14",
            })
            self.assertEqual(admin_register.status_code, 201)

            target_register = await self.manager_b.post("/api/auth/register", json={
                "full_name": "Role Target", "email": "role-target@example.com", "password": "strong-password-15",
            })
            self.assertEqual(target_register.status_code, 201)
            self.assertEqual(target_register.json()["role"], "manager")
            target_id = target_register.json()["id"]

            updated = await self.manager_a.patch(
                f"/api/admin/managers/{target_id}/role", json={"role": "admin"},
            )
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.json()["role"], "admin")

            # Verify directly against the database, not just the mutation's
            # own echoed response.
            db = await get_db()
            try:
                stored_role = await db.scalar(
                    select(ManagerRecord.role).where(ManagerRecord.id == target_id)
                )
            finally:
                await db.close()
            self.assertEqual(stored_role, "admin")

            # And independently re-fetch via a fresh GET, not a cached value.
            listed = await self.manager_a.get("/api/admin/managers")
            target_row = next(m for m in listed.json() if m["id"] == target_id)
            self.assertEqual(target_row["role"], "admin")
        finally:
            os.environ["ADMIN_EMAILS"] = "admin@example.com"


def tearDownModule():
    try:
        os.unlink(TEST_DB_PATH)
    except FileNotFoundError:
        pass


if __name__ == "__main__":
    unittest.main()
