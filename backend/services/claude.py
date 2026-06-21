import logging
import os
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-sonnet-4-6"

# Conservative char budget (~4 chars/token) that stays well under both Groq's
# 128k-token window (Llama 3.3 70B) and Claude's 200k-token window once the
# system prompt and completion budget are accounted for. Calls longer than
# this are condensed map-reduce style before being sent to the provider.
MAX_TRANSCRIPT_CHARS = int(os.getenv("MAX_TRANSCRIPT_CHARS", "150000"))
CONDENSE_CHUNK_CHARS = int(os.getenv("CONDENSE_CHUNK_CHARS", "20000"))

ERROR_NOTICE = (
    "\n\n---\n⚠️ Генерация прервана: AI-провайдер временно недоступен. "
    "Попробуйте сгенерировать конспект ещё раз через минуту.\n"
)

CONDENSE_SYSTEM = """Сожми этот фрагмент транскрипции созвона в подробные тезисы на русском языке.
Сохрани всю конкретику: названия университетов, страны, специальности, баллы, даты, суммы, имена, \
принятые решения и договорённости. Не добавляй ничего, чего не было сказано. Пиши тезисами, без вступлений."""

# ── Prompts ────────────────────────────────────────────────────────────────────

PERIODIC_SYSTEM = """Ты ассистент образовательного консультанта по поступлению в зарубежные университеты.
На основе фрагмента транскрипции созвона напиши краткое резюме (3-5 предложений) на русском языке.
Укажи: что обсуждалось, какие решения приняты, какие важные данные прозвучали (университеты, баллы, даты, страны).
Только то, что реально прозвучало."""

FINAL_SYSTEM = """Ты опытный ассистент образовательного консультанта — специалиста по поступлению в зарубежные университеты. \
Твоя задача — создать детальный профессиональный конспект созвона строго на русском языке на основе транскрипции.

ПРАВИЛА:
- Пиши ТОЛЬКО о том, что реально прозвучало — не придумывай и не додумывай
- Фиксируй конкретику: названия университетов, страны, специальности, баллы, даты, суммы
- Если тема не обсуждалась — пиши «Не обсуждалось»
- Дедлайны указывай с конкретными датами если они были названы
- В чеклисте отмечай [x], если тема реально обсуждалась, был зафиксирован факт, решение, проблема или следующий шаг. Не требуй, чтобы тема была полностью закрыта.
- Чеклист заполняй по строгим условиям ниже. Не оставляй пункт пустым, если условие выполнено.
- Перед финальным ответом сделай внутреннюю самопроверку: если в разделах выше написан конкретный факт, задача или вывод по теме чеклиста, соответствующий пункт должен быть [x].

УСЛОВИЯ ДЛЯ ЧЕКЛИСТА:
- [x] Определились со страной и направлением обучения: если явно названы и страна, и направление/специальность/уровень обучения. Если названа только страна — [ ].
- [x] Подобран список университетов для подачи: если названы конкретные университеты, которые рассматривают для подачи. Любые два и более конкретных вуза — [x], даже если финальный список ещё не утверждён.
- [x] Проверены академические требования и проходные баллы: если обсуждали GPA/IELTS/SAT/экзамены/проходные баллы именно как требования выбранных вузов. Просто наличие балла у студента без связи с требованиями вуза — [ ].
- [x] Обсуждены сроки подачи документов: если называли дедлайны, intake, месяц/дату подачи, сроки подготовки или задачу уточнить сроки.
- [x] Составлен план подготовки к IELTS/TOEFL или другим языковым экзаменам: если обсуждали экзамен и конкретный следующий шаг по подготовке/сдаче. Просто текущий балл без плана — [ ].
- [x] Определён список необходимых документов: если называли конкретные документы, отсутствие документов/паспорта, что уже готово, чего не хватает или задачу собрать документы.
- [x] Обсуждены возможности грантов, стипендий и скидок: если говорили о грантах/скидках/стипендиях, финансовой поддержке или задаче их изучить.
- [x] Составлен план по усилению портфолио: если обсуждали активности, проекты, олимпиады, волонтёрство, курсы или конкретный план усиления.
- [x] Разобраны финансовые вопросы: если обсуждали бюджет, стоимость обучения, проживание, финансовые ограничения или возможность финансовой поддержки.
- [x] Определены ближайшие шаги и дедлайны для студента: если в созвоне появились конкретные next steps для студента, даже без точной даты.
- [x] Проведён анализ шансов: если консультант оценивал вероятность/реалистичность поступления, сильные/слабые стороны профиля или риски.
- [x] Обсуждены запасные варианты: если называли альтернативные страны/вузы/программы или стратегию на случай отказа.
- [x] Даны рекомендации по внеклассной активности и развитию профиля: если консультант дал конкретные рекомендации по профилю.
- [x] Проверен прогресс по текущим задачам и подготовке документов: если это повторный созвон и обсуждали, что студент уже сделал с прошлого раза.

ФОРМАТ (строго Markdown):

# Назначение созвона
(Тип: вводный / повторный / по подаче / по документам / по финансам / другое. \
Одно предложение — зачем состоялся этот звонок.)

# Цели созвона
- (2–5 конкретных целей, которые ставились на этот звонок)

# Что обсудили

## Направление и страна
(Страна/страны, направление, уровень обучения: бакалавриат / магистратура / PhD)

## Университеты
(Конкретные вузы: названия, программы, требования, проходные баллы — только если упоминались)

## Документы и требования
(Что нужно, что уже готово, чего не хватает)

## Языковые экзамены
(IELTS / TOEFL / Duolingo — текущий уровень, нужный балл, план подготовки)

## Финансы и гранты
(Стоимость обучения и проживания, гранты, стипендии, скидки — конкретные цифры если были)

## Портфолио и активности
(Внеклассная активность, волонтёрство, проекты, олимпиады, курсы — что есть и что нужно)

## Анализ шансов и запасные варианты
(Оценка шансов, запасные вузы или направления — если обсуждалось)

# Дедлайны и ближайшие шаги
- (конкретная дата или срок): (задача) — СТУДЕНТ
- (конкретная дата или срок): (задача) — КОНСУЛЬТАНТ
(Если дата не названа — пиши «Ближайшее время» или «До следующего созвона»)

# Чеклист прогресса
(Отметь [x] если пункт был закрыт/обсуждён на этом созвоне, [ ] если нет)
- [ ] Определились со страной и направлением обучения
- [ ] Подобран список университетов для подачи
- [ ] Проверены академические требования и проходные баллы
- [ ] Обсуждены сроки подачи документов
- [ ] Составлен план подготовки к IELTS/TOEFL или другим языковым экзаменам
- [ ] Определён список необходимых документов (аттестат, транскрипт, мотивационное письмо, рекомендации)
- [ ] Обсуждены возможности грантов, стипендий и скидок
- [ ] Составлен план по усилению портфолио (волонтёрство, олимпиады, проекты, курсы)
- [ ] Разобраны финансовые вопросы: стоимость обучения, проживания и сопутствующие расходы
- [ ] Определены ближайшие шаги и дедлайны для студента
- [ ] Проведён анализ шансов на поступление в выбранные университеты
- [ ] Обсуждены запасные варианты поступления на случай отказов
- [ ] Даны рекомендации по внеклассной активности и развитию профиля
- [ ] Проверен прогресс по текущим задачам и подготовке документов

# Рекомендации консультанту
(Что важно учесть на следующем созвоне, что требует особого внимания, \
тревожные сигналы или срочные вопросы. 3–5 предложений.)

# Краткое резюме
(2–3 предложения: главный итог созвона и ключевой следующий шаг.)"""

FINAL_USER_TEMPLATE = """Транскрипция созвона:
{transcript}

---
Студент: {student_name}
Консультант/Менеджер: {manager_name}
Страна студента: {country}
Описание созвона: {call_description}
Дата созвона: {date}
Длительность: {duration}

Создай структурированный конспект строго по указанному формату."""

# ── Demo fallback (no API key) ─────────────────────────────────────────────────

DEMO_MARKDOWN = """# Назначение созвона

Вводный созвон — первичная диагностика студента, знакомство с направлением и целями поступления.

# Цели созвона

- Определить страну и направление обучения
- Оценить академический профиль студента
- Обсудить языковые требования и текущий уровень
- Составить предварительный список университетов
- Определить ближайшие шаги

# Что обсудили

## Направление и страна
Рассматривают Германию и Нидерланды. Направление — Computer Science, бакалавриат. \
Студент — 11 класс, планирует поступать в следующем году.

## Университеты
Предварительно: TU Munich, TU Berlin, Eindhoven University of Technology. \
Требования уточняются. Проходные баллы по математике и физике высокие.

## Документы и требования
Нужны: аттестат с апостилем, транскрипт, мотивационное письмо, 2 рекомендации. \
Аттестат будет готов в июне. Мотивационное письмо не начато.

## Языковые экзамены
Для Германии — IELTS 6.5+. Текущий уровень студента — B1. \
Нужно минимум 6 месяцев интенсивной подготовки.

## Финансы и гранты
Германия — бесплатное обучение (семестровый взнос ~350 EUR). \
Проживание ~700–900 EUR/мес. Обсудили стипендию DAAD.

## Портфолио и активности
Участие в школьной олимпиаде по математике (призёр). \
Рекомендовали добавить: онлайн-курс по программированию, pet-project на GitHub.

## Анализ шансов и запасные варианты
Шансы хорошие при условии IELTS 7.0+. Запасной вариант — Чехия (CTU Prague).

# Дедлайны и ближайшие шаги

- До 1 февраля: записаться на IELTS — СТУДЕНТ
- До 15 января: начать мотивационное письмо — СТУДЕНТ
- До следующего созвона: подготовить список из 8–10 университетов — КОНСУЛЬТАНТ
- До следующего созвона: прислать транскрипт оценок — СТУДЕНТ

# Чеклист прогресса

- [x] Определились со страной и направлением обучения
- [ ] Подобран список университетов для подачи
- [ ] Проверены академические требования и проходные баллы
- [ ] Обсуждены сроки подачи документов
- [x] Составлен план подготовки к IELTS/TOEFL или другим языковым экзаменам
- [ ] Определён список необходимых документов (аттестат, транскрипт, мотивационное письмо, рекомендации)
- [x] Обсуждены возможности грантов, стипендий и скидок
- [x] Составлен план по усилению портфолио (волонтёрство, олимпиады, проекты, курсы)
- [x] Разобраны финансовые вопросы: стоимость обучения, проживания и сопутствующие расходы
- [x] Определены ближайшие шаги и дедлайны для студента
- [ ] Проведён анализ шансов на поступление в выбранные университеты
- [x] Обсуждены запасные варианты поступления на случай отказов
- [x] Даны рекомендации по внеклассной активности и развитию профиля
- [ ] Проверен прогресс по текущим задачам и подготовке документов

# Рекомендации консультанту

Студент мотивирован, но уровень английского — главный риск. Необходимо контролировать \
прогресс по IELTS на каждом созвоне. Родители активно участвуют — учитывать их вопросы \
по финансам. На следующем созвоне: утвердить список университетов и обсудить структуру \
мотивационного письма. Срочно: напомнить про запись на IELTS — ближайшие даты сдачи заполняются быстро.

# Краткое резюме

Продуктивный вводный созвон: определились с Германией и Нидерландами (CS, бакалавриат), \
обсудили финансы и гранты, составили план по IELTS и портфолио. \
Главный следующий шаг — студент записывается на IELTS, консультант готовит список вузов."""


# ── Provider dispatch with runtime fallback ───────────────────────────────────
#
# Groq/Anthropic are tried in priority order on every call (not just once at
# startup). If a provider fails before any output was produced, the next one
# in the chain is tried transparently. If it fails mid-stream (output already
# sent to the client), switching providers would duplicate content, so the
# failure is surfaced as a visible notice instead of silently retried.

def _provider_chain() -> list[str]:
    chain = []
    if GROQ_API_KEY:
        chain.append("groq")
    if ANTHROPIC_API_KEY:
        chain.append("anthropic")
    return chain or ["demo"]


async def _stream_provider(
    provider: str, system: str, user_message: str, max_tokens: int
) -> AsyncGenerator[str, None]:
    if provider == "groq":
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        stream = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=0.3,
            stream=True,
        )
        async for chunk in stream:
            text = chunk.choices[0].delta.content
            if text:
                yield text
    elif provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        async with client.messages.stream(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
    else:
        raise RuntimeError("no AI provider configured")


async def _stream_with_fallback(
    system: str, user_message: str, max_tokens: int, demo_chunks: list[str]
) -> AsyncGenerator[str, None]:
    chain = _provider_chain()
    if chain == ["demo"]:
        for chunk in demo_chunks:
            yield chunk
        return

    for provider in chain:
        yielded = False
        try:
            async for chunk in _stream_provider(provider, system, user_message, max_tokens):
                yielded = True
                yield chunk
            return
        except Exception:
            logger.exception("AI provider %r failed during streaming", provider)
            if yielded:
                yield ERROR_NOTICE
                return
            continue  # nothing sent yet for this provider — safe to fall back

    yield ERROR_NOTICE


async def _complete_provider(provider: str, system: str, user_message: str, max_tokens: int) -> str:
    if provider == "groq":
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY)
        response = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=0.1,
        )
        return response.choices[0].message.content or ""
    if provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            temperature=0.1,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return "".join(block.text for block in response.content if hasattr(block, "text"))
    raise RuntimeError("no AI provider configured")


async def _complete_with_fallback(system: str, user_message: str, max_tokens: int) -> str:
    last_error: Exception | None = None
    for provider in _provider_chain():
        if provider == "demo":
            raise RuntimeError("no AI provider configured")
        try:
            return await _complete_provider(provider, system, user_message, max_tokens)
        except Exception as exc:
            last_error = exc
            logger.exception("AI provider %r failed", provider)
            continue
    raise RuntimeError("all AI providers failed") from last_error


async def _condense_transcript(transcript: str) -> str:
    """Map-reduce a transcript that's too long for a single context window."""
    if len(transcript) <= MAX_TRANSCRIPT_CHARS:
        return transcript

    logger.info("Condensing %d-char transcript before sending it to the AI provider", len(transcript))
    lines = transcript.split("\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for line in lines:
        if current and current_len + len(line) > CONDENSE_CHUNK_CHARS:
            chunks.append("\n".join(current))
            current, current_len = [], 0
        current.append(line)
        current_len += len(line) + 1
    if current:
        chunks.append("\n".join(current))

    summaries = []
    for index, chunk in enumerate(chunks):
        try:
            summary = await _complete_with_fallback(CONDENSE_SYSTEM, chunk, max_tokens=500)
        except RuntimeError:
            # Provider unavailable mid-condensation: keep the raw chunk (capped)
            # rather than silently dropping that part of the call.
            summary = chunk[:CONDENSE_CHUNK_CHARS]
        summaries.append(f"[Часть {index + 1}/{len(chunks)}]\n{summary}")
    return "\n\n".join(summaries)


# ── Streaming generators ──────────────────────────────────────────────────────

async def stream_periodic_summary(recent_text: str) -> AsyncGenerator[str, None]:
    demo_chunks = ["Краткое резюме: ученик активно работал, разбирали новый материал."]
    async for chunk in _stream_with_fallback(PERIODIC_SYSTEM, recent_text, max_tokens=400, demo_chunks=demo_chunks):
        yield chunk


async def stream_final_note(
    transcript: str,
    student_name: str,
    manager_name: str,
    country: str,
    call_description: str,
    date: str,
    duration: str,
) -> AsyncGenerator[str, None]:
    transcript = await _condense_transcript(transcript)
    user_message = FINAL_USER_TEMPLATE.format(
        transcript=transcript,
        student_name=student_name,
        manager_name=manager_name,
        country=country,
        call_description=call_description or "Не указано",
        date=date,
        duration=duration,
    )
    demo_chunks = [DEMO_MARKDOWN[i:i + 60] for i in range(0, len(DEMO_MARKDOWN), 60)]
    async for chunk in _stream_with_fallback(FINAL_SYSTEM, user_message, max_tokens=3000, demo_chunks=demo_chunks):
        yield chunk


async def answer_from_transcript(question: str, transcript: str, summary: str) -> str:
    """Answer only from the persisted source transcript; the summary is secondary context."""
    system = (
        "Ты отвечаешь на вопросы менеджера о конкретном созвоне. "
        "Используй только факты из транскрипции и конспекта ниже. "
        "Если ответа в данных нет, прямо скажи: «В созвоне это не обсуждалось». "
        "Не додумывай. Отвечай кратко и по-русски."
    )
    transcript = await _condense_transcript(transcript)
    user = f"""ВОПРОС:
{question}

КОНСПЕКТ:
{summary}

ПОЛНАЯ ТРАНСКРИПЦИЯ:
{transcript}
"""
    if _provider_chain() == ["demo"]:
        return "AI-провайдер не настроен. Добавьте GROQ_API_KEY или ANTHROPIC_API_KEY на сервере."
    try:
        answer = await _complete_with_fallback(system, user, max_tokens=800)
        return answer or "В созвоне это не обсуждалось."
    except RuntimeError:
        return "AI-провайдер временно недоступен. Попробуйте задать вопрос ещё раз через минуту."
