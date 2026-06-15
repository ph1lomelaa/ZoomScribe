# ZoomScribe — AI Конспекты уроков

Веб-приложение для конспектирования уроков Zoom/Teams с помощью AI.

## Возможности

- Реальная транскрипция через Deepgram в браузере
- AI-конспект через Groq или Anthropic
- Карточки сессий с информацией об ученике и менеджере
- Список конспектов с поиском
- Мультиязычность: русский, английский, казахский
- SQLite БД на backend

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

Frontend отдается через Nginx, а `/api/*` проксируется на FastAPI backend внутри Docker Compose. Данные SQLite хранятся в volume `zoomscribe_backend_data`.

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

`VITE_DEEPGRAM_API_KEY` встраивается в frontend-бандл и виден в браузере после деплоя.

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
│   └── data/             # SQLite база (создаётся автоматически)
│       └── scribe.db
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
| GET | `/api/sessions` | Список всех сессий |
| POST | `/api/sessions` | Создать сессию |
| GET | `/api/sessions/:id` | Данные сессии |
| PATCH | `/api/sessions/:id/end` | Завершить сессию |
| DELETE | `/api/sessions/:id` | Удалить сессию |
| POST | `/api/sessions/:id/transcripts` | Добавить сегмент транскрипции |
| POST | `/api/sessions/:id/notes/generate` | Генерировать конспект (стриминг) |
| GET | `/api/notes` | Все конспекты |
| GET | `/api/notes/:id` | Конспект по ID |
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
| `GROQ_API_KEY` | Ключ Groq API, имеет приоритет над Anthropic | `` |
| `GROQ_MODEL` | Модель Groq | `llama-3.3-70b-versatile` |
| `ANTHROPIC_API_KEY` | Ключ Anthropic API | `` |
| `VITE_DEEPGRAM_API_KEY` | Ключ Deepgram для браузерной транскрипции | `` |
| `DB_PATH` | Путь к SQLite БД | `./data/scribe.db` |
| `PORT` | Порт сервера | `8000` |
| `CORS_ORIGINS` | Разрешенные origins для прямых запросов к backend | `http://localhost:5173` |
| `FRONTEND_PORT` | Публичный порт frontend в Docker Compose | `8080` |

## Технологии

- Backend: Python / FastAPI / SQLite
- Frontend: React / Vite / Tailwind
- Production frontend: Nginx
- AI: Groq или Anthropic
- Speech-to-text: Deepgram browser WebSocket
