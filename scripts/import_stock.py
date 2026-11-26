"""Пересобирает www/stock.js из выгрузки остатков (колонки: Артикул, Номенклатура, Ед. изм., Доступно).

Запуск: python scripts/import_stock.py "путь\\к\\остаткам.xlsx"
Артикулов, которых нет в выгрузке, приложение показывает как «нет в наличии».
"""
import json
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "www" / "stock.js"


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = wb.worksheets[0].iter_rows(values_only=True)
    head = [str(v).strip() if v else "" for v in next(rows)]
    assert head[0] == "Артикул" and "Доступно" in head, f"Изменились колонки выгрузки: {head}"
    col = head.index("Доступно")
    stock = {}
    for r in rows:
        if r[0] is None:  # строки групп номенклатуры
            continue
        sku = str(r[0]).strip()
        stock[sku] = stock.get(sku, 0) + (r[col] or 0)
    assert len(stock) > 50, "Остатки прочитаны не полностью"
    # сайт публичный: оставляем только артикулы из прайса TECEspring
    src = (OUT.parent / "price.js").read_text(encoding="utf-8")
    price = json.loads(src[src.index("{"): src.rindex("}") + 1])
    wanted = {i["sku"] for s in price["sections"] for i in s["items"]}
    stock = {k: v for k, v in stock.items() if k in wanted}
    date = wb.properties.modified or wb.properties.created
    data = {"date": date.strftime("%d.%m.%Y") if date else "", "items": {k: int(v) if v == int(v) else v for k, v in stock.items()}}
    OUT.write_text("window.STOCK = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{OUT.name}: {len(stock)} артикулов, дата {data['date']}")


if __name__ == "__main__":
    main(sys.argv[1])
