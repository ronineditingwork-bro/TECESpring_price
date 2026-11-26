"""Пересобирает price.js из вкладки «ТЕСЕspring сантехника» прайса TECE.

Запуск: python scripts/import_price.py "путь\\к\\прайсу.xlsx"
Нужен openpyxl: pip install openpyxl
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

SHEET = "ТЕСЕspring сантехника"
OUT = Path(__file__).resolve().parent.parent / "www" / "price.js"


def clean(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def main(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True)[SHEET]
    rows = [r for r in ws.iter_rows(values_only=True) if any(v is not None for v in r)]
    head = next(i for i, r in enumerate(rows) if clean(r[0]) == "Артикул")
    assert clean(rows[head][3]).startswith("РРЦ, EUR"), "Изменились колонки прайса"
    title = clean(rows[head - 1][1])
    rate = float(re.search(r"=\s*([\d.,]+)", clean(rows[head - 1][3])).group(1).replace(",", "."))

    sections, seen = [], set()
    for r in rows[head + 1:]:
        sku, name, unit, eur, rub = (list(r) + [None] * 5)[:5]
        if sku is None and name:
            sections.append({"name": clean(name), "items": []})
        elif sku is not None and name and isinstance(eur, (int, float)):
            sku = clean(sku)
            if sku in seen:  # в прайсе есть повторы строк (AF042300-L9)
                continue
            seen.add(sku)
            rub_calc = round(eur * rate, 2)
            assert abs(rub_calc - float(rub)) < 0.01, f"{sku}: цена в рублях не равна EUR × курс"
            sections[-1]["items"].append({"sku": sku, "name": clean(name), "unit": clean(unit), "eur": eur, "rub": rub_calc})

    count = sum(len(s["items"]) for s in sections)
    assert count > 50 and all(s["items"] for s in sections), "Прайс прочитан не полностью"
    data = {"title": title, "rate": rate, "sections": sections}
    OUT.write_text("window.PRICE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{OUT.name}: {len(sections)} разделов, {count} позиций, курс {rate}")


if __name__ == "__main__":
    main(sys.argv[1])
