# PROJECT_CONTEXT

Updated: 2026-03-17

## Project

pharma-study-helper

## Goal

- Держать локальный standalone helper для повторения 18 билетов по фармакологии.
- Иметь один repo, где вместе живут UI, данные билетов, source artifacts и project context.

## Scope

- Статическое веб-приложение без сборки и без backend.
- Хранение прогресса, темы и AI key в `localStorage`.
- Рабочий датасет билетов в `bilets-data.json`.
- Source artifacts в `runtime/source-artifacts/` для будущей сверки и правки контента.

## Current direction

- Миграция из старого `D:\code\2026\1\pharma-study-helper` завершена в новый standalone repo.
- Дальше вся работа идёт только в `D:\code\2026\3\pharma-study-helper`.
- Следующий смысловой трек: ревизия ответов в `bilets-data.json` против PDF и черновых полных ответов.

## Constraints

- Никакой сборки, фреймворков и обязательного backend.
- Приложение должно подниматься обычным локальным HTTP server.
- Source of truth по формулировкам вопросов — PDF с билетами, а не вручную правленный JSON.
- `answers-full.md` полезен как reference, но сейчас покрывает не весь набор билетов.
