"""Обновляет остатки одного склада в www/stock.js.

Запуск:
  python scripts/import_stock.py Краснодар "путь\\к\\остаткам.xlsx"
  python scripts/import_stock.py Москва "путь\\к\\остаткам ОБЕРОН.xlsx"

Понимает обе выгрузки: «Артикул … Доступно» на первом листе и прайс с колонкой
«Текущие остатки» (берётся вкладка «ТЕСЕspring сантехника»). Остальные склады в stock.js не трогает.
Артикулов, которых нет в выгрузке, приложение считает отсутствующими на этом складе.
"""
import json
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "www" / "stock.js"
SHEET = "ТЕСЕspring сантехника"
QTY_COLUMNS = ("Доступно", "Текущие остатки")


def sku_of(v):
    # в части выгрузок артикулы-числа приходят как 9700998.0
    return str(int(v)) if isinstance(v, float) and v == int(v) else str(v).strip()


def read(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[SHEET] if SHEET in wb.sheetnames else wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    for head in rows:
        if head and head[0] and str(head[0]).strip() == "Артикул":
            break
    else:
        raise SystemExit("Не найдена строка заголовка «Артикул»")
    head = [str(v).strip() if v else "" for v in head]
    col = next((head.index(c) for c in QTY_COLUMNS if c in head), None)
    assert col is not None, f"Нет колонки остатков ({' или '.join(QTY_COLUMNS)}): {head}"
    stock = {}
    for r in rows:
        if r[0] is None:  # строки групп номенклатуры
            continue
        q = r[col] if isinstance(r[col], (int, float)) else 0
        stock[sku_of(r[0])] = stock.get(sku_of(r[0]), 0) + q
    date = wb.properties.modified or wb.properties.created
    return stock, date.strftime("%d.%m.%Y") if date else ""


def main(store, path):
    stock, date = read(path)
    # сайт публичный: оставляем только артикулы из прайса TECEspring
    src = (OUT.parent / "price.js").read_text(encoding="utf-8")
    price = json.loads(src[src.index("{"): src.rindex("}") + 1])
    wanted = {i["sku"] for s in price["sections"] for i in s["items"]}
    found = {k: int(v) if v == int(v) else v for k, v in stock.items() if k in wanted}
    assert len(found) > 20, f"Совпало с прайсом только {len(found)} артикулов — проверьте файл"

    data = {"stores": []}
    if OUT.exists():
        old = OUT.read_text(encoding="utf-8")
        data = json.loads(old[old.index("{"): old.rindex("}") + 1])
    data["stores"] = [s for s in data.get("stores", []) if s["name"] != store]
    data["stores"].append({"name": store, "date": date, "items": found})
    data["stores"].sort(key=lambda s: s["name"] != "Краснодар")  # свой склад первым
    OUT.write_text("window.STOCK = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{OUT.name}: {store} — {len(found)} артикулов из прайса, {sum(v > 0 for v in found.values())} в наличии, дата {date}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
