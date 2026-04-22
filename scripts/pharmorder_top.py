"""Запускается на VPS PharmOrder. Извлекает топ заказанных препаратов из order_history.db."""

import sqlite3
import json
import sys

DB = "/opt/pharmorder/src/data/order_history.db"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Cхема
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
schema = {}
for t in tables:
    cur.execute(f"PRAGMA table_info({t})")
    cols = [r[1] for r in cur.fetchall()]
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    n = cur.fetchone()[0]
    schema[t] = {"rows": n, "cols": cols}

print("=== SCHEMA ===")
print(json.dumps(schema, ensure_ascii=False, indent=2))

# Таблица orders, колонки tovar (название) + kol (количество)
print("\n=== TOP-150 препаратов по сумме заказанного количества ===")
cur.execute("""
    SELECT tovar, SUM(kol) AS total_kol, COUNT(*) AS n_orders
    FROM orders
    WHERE tovar IS NOT NULL AND tovar != ''
    GROUP BY tovar
    ORDER BY total_kol DESC
    LIMIT 150
""")
for r in cur.fetchall():
    total = int(r["total_kol"] or 0)
    print(f"  {total:>8} шт | {r['n_orders']:>5} приходов | {r['tovar']}")

print("\n=== TOP-150 по числу приходов (насколько часто заказывается) ===")
cur.execute("""
    SELECT tovar, COUNT(*) AS n_orders, SUM(kol) AS total_kol
    FROM orders
    WHERE tovar IS NOT NULL AND tovar != ''
    GROUP BY tovar
    ORDER BY n_orders DESC
    LIMIT 150
""")
for r in cur.fetchall():
    total = int(r["total_kol"] or 0)
    print(f"  {r['n_orders']:>5} приходов | {total:>8} шт | {r['tovar']}")

conn.close()
