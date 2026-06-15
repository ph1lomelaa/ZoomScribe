# 🎙 ZoomScribe — AI Конспекты уроков

Веб-приложение для конспектирования уроков Zoom/Teams с помощью AI.

## ✨ Возможности

- 🎙 **Реальная транскрипция** через Web Speech API (Chrome/Edge)
- 🤖 **AI конспект** через Claude (Anthropic API) 
- 📋 **Карточки сессий** с информацией об ученике и менеджере
- 📚 **Список конспектов** с поиском
- 🌍 **Мультиязычность**: русский, английский, казахский
- 💾 **Локальная БД** на SQLite — ничего не уходит в облако

## 🚀 Быстрый старт

### 1. Установите зависимости

```bash
cd backend
pip install -r requirements.txt
```

### 2. Запустите сервер

```bash
# Без AI (демо-режим):
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# С AI (нужен API ключ Anthropic):
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Откройте приложение

Откройте файл `frontend/index.html` в **Chrome или Edge**  
(Web Speech API работает только в этих браузерах)

> ⚠️ Для работы Speech API нужен HTTPS или localhost.  
> Если открываете через файловую систему, некоторые браузеры блокируют микрофон.  
> Используйте Live Server (VS Code) или `python3 -m http.server 3000` в папке `frontend`.

## 📁 Структура проекта

```
zoomscribe/
├── backend/
│   ├── main.py           # FastAPI сервер
│   ├── requirements.txt
│   └── data/             # SQLite база (создаётся автоматически)
│       └── scribe.db
├── frontend/
│   ├── index.html        # Главная страница
│   ├── style.css         # Дизайн
│   └── app.js            # Весь фронтенд (SPA)
├── start.sh              # Скрипт запуска
└── README.md
```

## 🔌 API Endpoints

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

## 🎙 Как конспектировать Zoom/Teams

1. **Запустите Zoom/Teams** — войдите в звонок
2. **Откройте ZoomScribe** — создайте новую сессию
3. **Включите микрофон** в ZoomScribe — он будет слушать **системный звук** (колонки)
4. **Или подключите наушники** — тогда микрофон захватит только вашу речь
5. **Нажмите «Завершить»** — AI сформирует конспект

> 💡 Для захвата звука собеседника рекомендуется включить «Стерео Микшер» в настройках Windows или использовать BlackHole/Loopback на macOS.

## ⚙️ Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Ключ Anthropic API | `` (демо-режим) |
| `DB_PATH` | Путь к SQLite БД | `./data/scribe.db` |
| `PORT` | Порт сервера | `8000` |

## 🛠 Технологии

- **Бэкенд**: Python 3.9+ / FastAPI / SQLite
- **Фронтенд**: Vanilla JS / CSS (без фреймворков)
- **AI**: Anthropic Claude Sonnet 4.6 (стриминг)
- **Речь**: Web Speech API (браузерный)
