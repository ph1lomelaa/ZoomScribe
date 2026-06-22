# ZoomScribe — AI-конспекты созвонов

Веб-приложение для транскрибации консультаций Zoom/Meet/Teams и подготовки AI-конспектов.

## Возможности

- Личные профили менеджеров с входом по email
- Вход через Google OAuth и роль администратора
- Изоляция созвонов, транскриптов и конспектов по менеджеру
- Live-транскрипция через Deepgram без публикации постоянного API-ключа в браузере
- Локальная очередь фрагментов, идемпотентная отправка и восстановление после разрыва сети
- AI-конспект через OpenAI или Anthropic
- Вопросы AI по сохранённому полному транскрипту
- Адаптивный кабинет для телефона, планшета и компьютера
- Мультиязычность: русский, английский, казахский
- PostgreSQL и несколько API workers в production; SQLite остаётся для простой локальной разработки

## Быстрый старт через Docker

```bash
cp .env.example .env
# заполните .env ключами
docker compose up -d --build
```

Откройте:

```text
http://localhost:8080
```

Frontend отдаётся через Nginx, `/api/*` проксируется на FastAPI, данные хранятся в PostgreSQL volume `postgres_data`.

Подробная инструкция по переносу на сервер: [DEPLOYMENT.md](DEPLOYMENT.md).

## Локальная разработка

### 1. Установите backend-зависимости

```bash
cd backend
pip install -r requirements.txt
```

### 2. Установите frontend-зависимости

```bash
cd frontend
npm install
```

### 3. Настройте env

```bash
cp .env.example .env
```

Заполните `.env` ключами. `./start.sh` и Docker Compose читают общий корневой `.env`.

`DEEPGRAM_API_KEY` хранится только на backend. Frontend получает короткоживущий токен на каждое подключение.

### 4. Запустите

```bash
./start.sh
```

Или вручную:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
cd frontend
npm run dev
```

Frontend: `http://localhost:5173`, backend: `http://localhost:8000`.

## Структура проекта

```
zoomscribe/
├── backend/
│   ├── Dockerfile
│   ├── main.py           # FastAPI сервер
│   ├── requirements.txt
│   └── data/             # SQLite только при локальном запуске без DATABASE_URL
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src/              # React/Vite frontend
│   └── package.json
├── docker-compose.yml
├── DEPLOYMENT.md
├── start.sh              # Скрипт запуска
└── README.md
```

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/auth/register` | Регистрация по email/password |
| POST | `/api/auth/login` | Вход по email/password |
| GET | `/api/auth/google/start` | Старт Google OAuth |
| GET | `/api/auth/google/callback` | Callback Google OAuth |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Текущий пользователь |
| GET | `/api/sessions` | Список всех сессий |
| POST | `/api/sessions` | Создать сессию |
| GET | `/api/sessions/:id` | Данные сессии |
| PATCH | `/api/sessions/:id/end` | Завершить сессию |
| DELETE | `/api/sessions/:id` | Удалить сессию |
| POST | `/api/sessions/:id/transcripts` | Добавить сегмент транскрипции |
| POST | `/api/sessions/:id/heartbeat` | Подтвердить активность записи |
| POST | `/api/sessions/:id/summaries/stream` | Live-резюме текущего созвона |
| POST | `/api/sessions/:id/notes/generate` | Генерировать конспект (стриминг) |
| GET | `/api/notes` | Все конспекты |
| GET | `/api/notes/:id` | Конспект по ID |
| POST | `/api/notes/:id/questions` | Ответ AI по полному транскрипту |
| GET | `/api/admin/managers` | Админ: список аккаунтов |
| GET | `/api/admin/sessions` | Админ: список всех созвонов |
| GET | `/api/health` | Статус сервера |

## Как конспектировать Zoom/Teams

1. Запустите Zoom/Teams и войдите в звонок.
2. Откройте ZoomScribe и создайте новую сессию.
3. Выберите захват системного звука или микрофона.
4. Нажмите «Завершить» — AI сформирует конспект.

Для микрофона и захвата экрана/системного звука браузеру нужен HTTPS, кроме `localhost`. На сервере обязательно настройте домен с TLS.

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `OPENAI_API_KEY` | Ключ OpenAI API, имеет приоритет над Anthropic | `` |
| `OPENAI_MODEL` | Модель OpenAI | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Ключ Anthropic API | `` |
| `DEEPGRAM_API_KEY` | Серверный ключ Deepgram | `` |
| `GOOGLE_CLIENT_ID` | OAuth client ID из Google Cloud | `` |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret из Google Cloud | `` |
| `GOOGLE_REDIRECT_URI` | Redirect URI для Google OAuth callback; должен совпадать с публичным frontend-origin | `http://localhost:8080/api/auth/google/callback` |
| `FRONTEND_URL` | Публичный URL фронтенда для редиректа после входа | `http://localhost:8080` |
| `ADMIN_EMAILS` | Список email через запятую, которые получают роль admin | `` |
| `DATABASE_URL` | Async SQLAlchemy URL; используется локально при необходимости | SQLite |
| `POSTGRES_*` | Параметры production PostgreSQL в Compose | см. `.env.example` |
| `WEB_CONCURRENCY` | Количество backend workers | `2` |
| `DB_PATH` | Путь к SQLite БД | `./data/scribe.db` |
| `PORT` | Порт сервера | `8000` |
| `CORS_ORIGINS` | Разрешенные origins для прямых запросов к backend | `http://localhost:5173` |
| `FRONTEND_PORT` | Публичный порт frontend в Docker Compose | `8080` |

## Технологии

- Backend: Python / FastAPI / PostgreSQL (SQLite для dev)
- Frontend: React / Vite / Tailwind
- Production frontend: Nginx
- AI: OpenAI или Anthropic
- Speech-to-text: Deepgram browser WebSocket
