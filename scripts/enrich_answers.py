"""Прогоняет ответы из bilets-data.json через OpenRouter и обогащает их:
примеры препаратов, разжёвывание терминов, сохраняя структуру исходного ответа.

Запуск:
    export OPENROUTER_API_KEY=sk-or-v1-...
    python scripts/enrich_answers.py
"""

import json
import os
import shutil
import sys
import time
from pathlib import Path
from urllib import request as urlreq
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "bilets-data.json"
BACKUP = ROOT / "bilets-data.backup.json"
MODEL = "google/gemini-2.5-pro"
API_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """Ты — преподаватель фармакологии, объясняющий материал студенту-первокурснику, который плохо понимает терминологию.

Твоя задача: взять существующий учебный ответ и ПЕРЕСОБРАТЬ его так, чтобы:
1. Сохранить ВСЮ фактическую суть исходного ответа (ничего не выкидывать).
2. Добавить конкретные примеры препаратов с торговыми/МНН названиями где уместно.
3. Разжевать сложные термины в скобках сразу после первого употребления (например: "бронходилататоры (лекарства, расширяющие бронхи)").
4. Структурировать маркдауном: **жирные подзаголовки**, маркированные списки для перечней.
5. Писать простым языком, как если бы объяснял человеку без медицинского образования.
6. НЕ придумывать новые факты — только раскрывать то что уже есть в исходном ответе.

Объём: 1500-2500 символов. Не меньше исходного.

Формат ответа: СРАЗУ выдай переработанный текст на русском. Без предисловий, без "Вот переработанный ответ:", без финальных комментариев. Только сам ответ."""

USER_TEMPLATE = """ВОПРОС: {question}

ИСХОДНЫЙ ОТВЕТ (который нужно пересобрать и разжевать):
{answer}

Пересобери этот ответ по правилам из system prompt."""


def call_openrouter(api_key: str, question: str, answer: str) -> str:
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_TEMPLATE.format(question=question, answer=answer)},
        ],
        "temperature": 0.3,
    }).encode("utf-8")

    req = urlreq.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://nickstr11.github.io/pharma-study-helper/",
            "X-Title": "Pharma Study Helper - enrich",
        },
        method="POST",
    )

    with urlreq.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not content:
        raise RuntimeError(f"Empty response: {data}")
    return content


def main() -> int:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY env var not set", file=sys.stderr)
        return 1

    with DATA.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not BACKUP.exists():
        shutil.copy(DATA, BACKUP)
        print(f"[backup] {BACKUP.name} создан")

    bilets = data["bilets"]
    total = sum(len(b["questions"]) for b in bilets)
    done = 0
    errors = []

    for bilet in bilets:
        answers = bilet.setdefault("answers", [])
        while len(answers) < len(bilet["questions"]):
            answers.append("")

        for qi, question in enumerate(bilet["questions"]):
            done += 1
            old_answer = answers[qi] or ""
            if not old_answer.strip():
                print(f"[{done}/{total}] билет {bilet['id']} в{qi + 1}: нет исходного — пропуск")
                continue

            prefix = f"[{done}/{total}] билет {bilet['id']} в{qi + 1}"
            print(f"{prefix}: {question[:70]}...", flush=True)
            start = time.time()
            try:
                new_answer = call_openrouter(api_key, question, old_answer)
                answers[qi] = new_answer
                print(f"  -> {len(new_answer)} симв, {time.time() - start:.1f}s", flush=True)
            except (HTTPError, URLError, RuntimeError) as e:
                errors.append((bilet["id"], qi, str(e)))
                print(f"  !! ошибка: {e}", flush=True)
                continue

            # инкрементально сохраняем — если скрипт упадёт, не потеряем прогресс
            with DATA.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            time.sleep(0.5)

    print(f"\nГотово. Ошибок: {len(errors)}")
    for bid, qi, err in errors:
        print(f"  билет {bid} в{qi + 1}: {err[:120]}")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main())
