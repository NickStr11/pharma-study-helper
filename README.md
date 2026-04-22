# pharma-study-helper

Standalone repo для старого проекта по билетам по фармакологии.

## Что здесь важно

- `index.html`, `styles.css`, `app.js`, `bilets-data.json` — текущее статическое приложение без сборки
- `memory/PROJECT_CONTEXT.md` — долгоживущая рамка проекта
- `memory/DEV_CONTEXT.md` — свежий handoff и known issues
- `runtime/source-artifacts/Билеты 30.05.25.pdf` — канонический источник формулировок билетов
- `runtime/source-artifacts/answers-full.md` — черновой расширенный банк ответов, полезный для сверки и дописывания

## Быстрый запуск

```powershell
cd D:\code\2026\3\pharma-study-helper
python -m http.server 8000
```

Открыть: `http://localhost:8000`

## AI-проверка

- жёстко вшитый Gemini API key из старого repo удалён
- при первом запуске AI-проверки приложение попросит ключ и сохранит его только в `localStorage` текущего браузера

## Что помнить

- PDF — source of truth по самим вопросам
- `bilets-data.json` — рабочая копия данных для приложения, но ответы там местами неровные и требуют ревизии
- `answers-full.md` пока неполный, но как source artifact всё ещё полезен

## Проверка project-local контекста

```powershell
.\scripts\validate-project-context.ps1
```
