"""Пересобирает www/price.js из всех вкладок розничного прайса TECE.

Запуск: python scripts/import_price.py "путь\\к\\прайсу.xlsx"
Нужен openpyxl: pip install openpyxl

Вкладка прайса → раздел приложения. Внутри строки-заголовки (без артикула) задают группы:
на вкладках с нумерованными заголовками («1. TECEflex») группа — нумерованный заголовок,
а заголовки под ним становятся подгруппами; на остальных вкладках группа — сам заголовок.
Цена берётся из колонки «РРЦ, РУБ.» как есть: часть позиций посчитана по своему курсу (например, 105).
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "www" / "price.js"
NUMBERED = re.compile(r"^\d+\.\s*")


def clean(v):
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


def sku_of(v):
    # артикулы-числа в Excel бывают float: 9700998.0
    return str(int(v)) if isinstance(v, float) and v == int(v) else clean(v)


def read_sheet(ws):
    rows = [r for r in ws.iter_rows(values_only=True) if any(v is not None for v in r)]
    head = next(i for i, r in enumerate(rows) if clean(r[0]) == "Артикул")
    cols = [clean(v) for v in rows[head]]
    rub_col = next(i for i, c in enumerate(cols) if c.startswith("РРЦ, РУБ"))
    eur_col = next((i for i, c in enumerate(cols) if c.startswith("РРЦ, EUR")), None)
    title = clean(next(v for v in rows[head - 1] if v is not None)) if head else ""
    numbered = any(r[0] is None and NUMBERED.match(clean(r[1])) for r in rows[head + 1:])

    groups, path, block, after_items = [], [], [], True
    for r in rows[head + 1:]:
        if r[0] is None:
            if clean(r[1]):
                if after_items:
                    block, after_items = [], False
                block.append(clean(r[1]))
            continue
        if not after_items:
            # шапка из k заголовков подряд заменяет последние k уровней пути; нумерованный заголовок начинает путь заново
            path = path[: max(0, len(path) - len(block))] + block
            for n, h in enumerate(path):
                if NUMBERED.match(h):
                    path = path[n:]
            if len(path) > 1 and path[0].lower() == ws.title.lower():
                path = path[1:]  # «Poloplast» над «POLO-KAL NG» — это название вкладки
            after_items = True
            gname = NUMBERED.sub("", path[0]) if numbered else path[-1]
            sub = " / ".join(path[1:]) if numbered else ""
            if not groups or groups[-1]["path"] != path[:1 if numbered else None]:
                groups.append({"name": gname, "path": path[:1 if numbered else None], "items": []})
        rub = r[rub_col] if rub_col < len(r) else None
        if not clean(r[1]) or not isinstance(rub, (int, float)) or rub <= 0:
            continue  # пустые и служебные строки (например, «#REF!» в конце вкладки)
        eur = r[eur_col] if eur_col is not None and isinstance(r[eur_col], (int, float)) else None
        groups[-1]["items"].append({"sku": sku_of(r[0]), "name": clean(r[1]), "unit": clean(r[2]) or "шт",
                                    "eur": eur, "rub": round(float(rub), 2), "sub": sub})
    # без нумерации группа — последний заголовок; серию («POLO-KAL 3S») дописываем, только если иначе имена совпадут
    names = [g["name"] for g in groups]
    merged = {}
    for g in groups:
        if not numbered and names.count(g["name"]) > 1 and len(g["path"]) > 1:
            g["name"] = f'{g["path"][-2]} / {g["name"]}'
        if g["name"] in merged:  # одна и та же группа в двух местах вкладки — показываем вместе
            merged[g["name"]]["items"] += g["items"]
        else:
            merged[g["name"]] = g
    groups = [{"name": g["name"], "items": g["items"]} for g in merged.values() if g["items"]]
    return {"name": clean(ws.title), "title": title, "groups": groups}


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets, seen = [], {}
    for ws in wb.worksheets:
        sheet = read_sheet(ws)
        for g in sheet["groups"]:
            keep = []
            for i in g["items"]:
                if i["sku"] in seen:  # повтор артикула (в том числе на другой вкладке) — оставляем первую строку
                    other = seen[i["sku"]]
                    if other["rub"] != i["rub"]:
                        print(f"  ! {i['sku']}: разные цены {other['rub']} и {i['rub']} — оставлена первая")
                    continue
                seen[i["sku"]] = i
                keep.append(i)
            g["items"] = keep
        sheet["groups"] = [g for g in sheet["groups"] if g["items"]]
        n = sum(len(g["items"]) for g in sheet["groups"])
        assert n > 20, f"Вкладка «{sheet['name']}» прочитана не полностью: {n} позиций"
        print(f"{sheet['name']}: {len(sheet['groups'])} групп, {n} позиций")
        sheets.append(sheet)
    OUT.write_text("window.PRICE = " + json.dumps({"sheets": sheets}, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{OUT.name}: {len(sheets)} вкладок, {len(seen)} позиций")


if __name__ == "__main__":
    main(sys.argv[1])
