# pharma-study-helper · STATE

> Снимок состояния проекта на 2026-04-27. Если открываешь этот repo в свежем чате Claude — читай это первым.

## Что это

Сайт для подготовки к экзамену по фармакологии (30.05.2026, группа Никиты). 18 билетов × 3 вопроса = 54 ответа. Хостинг — GitHub Pages. **Аудитория: ~5 одногруппников + сам Никита**, владелец аптеки на юге РФ.

- Live: https://nickstr11.github.io/pharma-study-helper/
- Repo: https://github.com/NickStr11/pharma-study-helper

## Архитектура

```
index.html        — структура, header, nav, modal, chat panel, FAB
styles.css        — все стили (фиолетовый градиент primary, 2 mobile breakpoints)
app.js            — логика: bilets data + AI-проверка + чат-помощник + рендер
bilets-data.json  — 18 билетов, по 3 вопроса + расширенный ответ (2500-3500 симв)
bilets-data.backup.json — исходные короткие ответы (570 симв) для отката если что
```

Статика, без билда. Ассеты подгружаются с `?v=20260423-bN` для cache-busting на мобилках. **При каждом изменении styles.css или app.js нужно бампать `bN`** в обоих местах в `index.html`.

## Что есть

### Контент
**54 расширенных ответа** в bilets-data.json. Прошли 3 прохода обогащения:
1. Gemini 2.5 Pro draft (25/54) — расширил из ~570 симв до ~3000
2. Claude Opus параллельные субагенты (6 батчей × 9 вопросов) — фактическая проверка + дописал остальное
3. Claude Opus с тремя приоритетами препаратов (P0 история заказов > P1 матрица > P2 общий)

**Источники данных** (в `runtime/`, gitignored для приватности):
- `pharmorder-top-orders.txt` — топ-150 заказов из VPS PharmOrder (86925 приходов)
- `pharmacy-inventory.csv` — матрица ассортимента (1659 позиций)
- `source-artifacts/Билеты 30.05.25.pdf` — оригинальный список билетов (не в git, авторский)

### AI-функции
1. **AI-проверка ответов студента** (`google/gemini-3-flash-preview` через OpenRouter):
   - Юзер выбирает билет/вопрос → пишет свой ответ → "Проверить"
   - В промпт передаётся **эталон** из bilets-data.json — модель сверяет, не придумывает
   - Структурированный фидбек: вердикт / совпадает / упущено / лишнее / итог

2. **Inline AI-помощник** (`google/gemini-2.5-flash`):
   - FAB в нижнем левом углу → slide-out панель справа
   - Multi-turn чат с историей пока окно открыто
   - Закрытие = очистка истории (приватность)
   - Bonus: при выделении текста в ответе билета появляется кнопка "Спросить у помощника" → открывает панель с автозапросом + контекстом абзаца

### Дизайн (B-style "Sharp & Characterful")
- Цвета: `--color-primary: #4F46E5` → `--color-primary-hover: #7C3AED` + `--gradient-primary: linear-gradient(135deg, ...)`
- Header: бренд + uppercase подпись `ЭКЗАМЕН · 30.05.25` + крупная цифра studied + прогресс-бар с фиолетовым glow
- Карточки билетов: border 2px, hover → outline + glow shadow, `:active` → scale(0.985), studied → треугольный sticker corner (зелёный)
- `h3 "Билет N"` — вертикальный градиент-тик слева
- Mobile: full-screen modal, safe-area iPhone, font-size 16px в input против iOS auto-zoom

## Ключи и секреты

**OpenRouter ключ хранится в localStorage юзера** под `pharma-openrouter-api-key`. При первом клике на AI-проверку или чат — браузер запрашивает.

⚠️ **Ключ НЕЛЬЗЯ вшивать в код** (репо публичный → боты сканируют GitHub → угоняют за минуты).

**Чтобы юзеры группы пользовались БЕЗ ввода своего ключа** — нужен прокси. Заготовка готова:
- Код Worker'а: `scripts/openrouter-proxy-worker.js`
- Инструкция: `scripts/PROXY-SETUP.md` (3-5 мин в CF Dashboard)
- В app.js уже есть переключатель `OPENROUTER_PROXY_URL` — пустой = старая логика, с URL = прокси

**TODO**: задеплоить прокси, прописать URL в app.js.

## Что есть в `scripts/`
- `enrich_answers.py` — pass 1 (Gemini, остановлен на 25/54)
- `enriched/` — pass 2 inputs/outputs (Claude Opus review Gemini draft)
- `ru_review/` — pass 3a inputs/outputs (RU-brand priority)
- `freq_review/` — pass 3b inputs/outputs (frequency from VPS)
- `pharmorder_top.py` — извлекает топ заказов из VPS `order_history.db`
- `ru-pharmacy-priority.md` — общерусский справочник топ-3 ходовых ТН по группам
- `openrouter-proxy-worker.js` + `PROXY-SETUP.md` — заготовка для CF Worker

## Как обновить ответ на конкретный билет

1. Найди в `bilets-data.json` нужный bilet/question.
2. Поправь `answers[N]` руками или через `renderMarkdown`-совместимый markdown (`**bold**`, `*italic*`, `* bullet`, `1. numbered`, `### heading`, `` `code` ``).
3. **НЕ ПИШИ `<br>` и не оставляй `**жирные строки**`** в виде заголовков — отдельная строка из одного `**жирного**` автоматически становится `<h4>`.
4. Бампни `?v=` в `index.html` для обоих ассетов.
5. Коммит + push. GH Pages пересоберётся за 1-2 мин.

## Открытые задачи

- [ ] **Cloudflare Worker proxy задеплоить** — `scripts/PROXY-SETUP.md`. После деплоя URL прописать в `OPENROUTER_PROXY_URL` в app.js (~строка 41).
- [ ] **Отозвать старый OpenRouter ключ** `sk-or-v1-5540...` (засветился). Создать новый, поставить лимит трат.
- [ ] Возможно: добавить service worker для офлайн-доступа (юзеры могут листать билеты в дороге без интернета).
- [ ] Возможно: счётчик прогресса "X/Y вопросов прочитано" с сохранением в localStorage (сейчас только "studied" toggle на уровне билета).

## Связь с cortex

Этот repo — **отдельный standalone проект**, не часть cortex. Но:
- VPS PharmOrder (часть cortex) использовался как источник данных (топ заказов).
- Diary cortex (`~/.claude/projects/D--code-2026-2-cortex/memory/diary/`) — там запись 024 от 27.04 описывает всю работу над этим проектом. Если нужен высокоуровневый контекст — читай diary 024.
