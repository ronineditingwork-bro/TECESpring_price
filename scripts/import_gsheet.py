"""Вкладки Deante, Deante кухня и KK POL из общей Google-таблицы: цены, характеристики, фото, остатки поставщика.

Запуск: python scripts/import_gsheet.py [папка-с-amana_site]
Таблица: https://docs.google.com/spreadsheets/d/1_WpQB6tO1jOml9DtfJFx0vOLa2Xt9UEE6FaugNa8b3s
Вкладки скачиваются в CSV (таблица открыта по ссылке). Повторный запуск обновляет цены и остатки;
уже скачанные фото не качаются заново. Папка AMANA_Site (необязательно) — запасные фото KK POL,
если в таблице для позиции фото нет. После запуска: python scripts/optimize_images.py
"""
import csv
import hashlib
import io
import json
import re
import shutil
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, get, load, save  # noqa: E402

SHEET = "https://docs.google.com/spreadsheets/d/1_WpQB6tO1jOml9DtfJFx0vOLa2Xt9UEE6FaugNa8b3s/gviz/tq?tqx=out:csv&gid="
TABS = {"Deante": "1104453248", "Deante кухня": "749813629", "KK POL": "520941540"}
# склады поставщика — показываются только на этих вкладках; «В пути» и «Польша» не считаются наличием
STORES = [("Санкт-Петербург", r"Остаток.*СПБ", False), ("Москва", r"Остаток.*(МОСКВА|МСК)", False),
          ("В пути", r"В Пути$", True), ("Польша", r"Наличие ПОЛЬША", True)]

# характеристики: подпись в карточке → колонка таблицы (по началу заголовка)
SPECS = {
    "Deante": [("Коллекция", "Коллекция"), ("Бренд", "БРЕНД"), ("Тип товара", "Тип товара"), ("Назначение", "Назначение"),
               ("Монтаж", "Монтаж"), ("Материал", "Материал"), ("Цвет", "цвет"), ("Длина, мм", "Длина"), ("Ширина, мм", "Ширина"),
               ("Высота, мм", "Высота"), ("Вес нетто, кг", "Вес нетто"), ("Вес брутто, кг", "Вес брутто"), ("Гарантия, лет", "Гарантия"),
               ("Страна", "Страна"), ("EAN", "EAN"), ("Статус", "СТАТУС")],
    "Deante кухня": [("Коллекция", "коллекция"), ("Тип товара", "Тип товара"), ("Цвет", "Цвет"), ("Материал", "Материал"),
                     ("Монтаж", "Монтаж"), ("Количество чаш", "Колличество чаш"), ("Мин. ширина шкафа, мм", "Минимальная ширина"),
                     ("Длина, мм", "Длина ,"), ("Ширина, мм", "Ширина ,"), ("Высота, мм", "Высота ,"),
                     ("Готовых отверстий", "Количество готовых"), ("Сифон", "Сифон"), ("Подключение стиральной машины", "Возможность подключения"),
                     ("Вес нетто, кг", "Вес нетто"), ("Вес брутто, кг", "Вес брутто"), ("Гарантия, лет", "Гарантия"), ("Страна", "Страна"), ("EAN", "EAN")],
    "KK POL": [("Раздел", "РАЗДЕЛ"), ("Цвет", "Цвет"), ("Материал", "Материал"), ("Длина, мм", "Длина"), ("Ширина, мм", "Ширина"),
               ("Высота, мм", "Высота"), ("Вес, кг", "Вес"), ("Гарантия, лет", "Гарантия"), ("Страна", "Страна")],
}
GROUP = {"Deante": "Тип товара", "Deante кухня": "Тип товара", "KK POL": "РАЗДЕЛ"}
SUB = {"Deante": "Коллекция", "Deante кухня": "коллекция", "KK POL": None}
PHOTOS = {"Deante": ["Главная фотография"], "Deante кухня": ["Главная фотография"], "KK POL": ["Фото", "Схема"]}
DOCS = {"Карта товара": "Карточка товара (PDF)", "Технический рисунок": "Технический рисунок", "Декларация": "Декларация"}
# тип не заполнен — группа по первому слову названия; ошибки в названиях разделов таблицы
BY_WORD = {"Смеситель": "Смеситель", "Излив": "Смеситель", "Душевой": "Аксессуары для душа", "Душевая": "Аксессуары для душа",
           "Душевое": "Аксессуары для душа", "Гигиеническая": "Аксессуары для душа", "Раковина": "Керамика", "Унитаз": "Керамика",
           "Унитаз-компакт": "Керамика", "Полотенцесушитель": "Полотенцесушитель", "Сиденье": "Сиденье", "Дренажный": "Сливная арматура",
           "Сифон": "Сливная арматура", "Клапан": "Сливная арматура", "Мойка": "Мойка кухонная", "Крючок": "Аксессуары для ванны",
           "Дозатор": "Аксессуары для ванны", "Клавиша": "Инсталляция", "Консоль": "Мебель"}
FIX = {"Клавишы смыва": "Клавиши смыва"}
EXACT = {"Ссылка на сайт", "Фото"}  # в Deante «Ссылка на сайт DEANTE Картинка» — другая колонка
SKIP_PROPS = {"серия", "цвет", "ean", "гарантия [лет]", "отделка"}  # уже есть в характеристиках


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def number(s):
    s = re.sub(r"[^\d,.\-]", "", (s or "").replace("\xa0", "")).replace(",", ".")
    try:
        return float(s) if s else None
    except ValueError:
        return None


def sku_of(raw, code):
    s = re.sub(r"\s*(СНЯТО С ПРОИЗВОДСТВА|SALE!+)\s*", " ", raw)
    s = re.sub(r"\s*\(.*?\)", "", s).replace(" /", "/").strip()
    return s or code


def col(head, rx):
    """Первая колонка, заголовок которой подходит под rx с начала (приписку «обновление раз в 30 минут» не считаем)."""
    for n, h in enumerate(head):
        if re.match(rx, re.sub(r"^обновление раз в \d+ \w+\s*", "", clean(h), flags=re.I), re.I):
            return n
    return None


def is_url(s, kind=""):
    return bool(re.match(r"https?://\S+$", s or "")) and (not kind or re.search(kind, s, re.I))


def read(name):
    text = get(SHEET + TABS[name])
    rows = list(csv.reader(io.StringIO(text)))
    head, rows = rows[0], [r + [""] * (len(rows[0]) - len(r)) for r in rows[1:] if any(c.strip() for c in r)]
    c = lambda start: col(head, re.escape(start) + ("$" if start in EXACT else ""))  # noqa: E731
    ci = {k: c(k) for k in ["Код", "Артикул", "Наименование", "РРЦ", "Цена РРЦ", "РРЦ ЕВРО", "Описание", "Отличительные черты",
                            "Дополнительные свойства", "Черты", "Ссылка на сайт", "Фото 1", *DOCS, *PHOTOS[name]]}
    stores = {s: col(head, rx) for s, rx, _ in STORES}
    price_col = ci["Цена РРЦ"] if ci["Цена РРЦ"] is not None else ci["РРЦ"]
    group_col, sub_col = c(GROUP[name]), (c(SUB[name]) if SUB[name] else None)
    spec_cols = [(label, c(start)) for label, start in SPECS[name]]
    assert None not in (ci["Артикул"], ci["Наименование"], price_col, group_col), f"{name}: не нашёл нужные колонки — изменилась таблица?"

    items, last_group = {}, ""
    for r in rows:
        price = number(r[price_col])
        sku = sku_of(clean(r[ci["Артикул"]]), clean(r[ci["Код"]]))
        if not price or not sku or sku in items or not clean(r[ci["Наименование"]]):
            continue  # пустые строки и повторы артикула (берём первую строку)
        group = clean(r[group_col]).strip("-") or (last_group if name == "KK POL" else "")  # в KK POL раздел пишут только у первой строки
        last_group = group
        group = group.capitalize() if group else ""
        nm = re.sub(rf"^{re.escape(clean(r[ci['Артикул']]).split()[0])}\s+", "", clean(r[ci["Наименование"]])) if clean(r[ci["Артикул"]]) else clean(r[ci["Наименование"]])
        nm = re.sub(r"^(DEANTE\s+|\(.*?\)\s*)", "", nm)
        if not group:
            group = BY_WORD.get(nm.split()[0], "Прочее")
            group = "Аксессуары" if name == "Deante кухня" and group == "Сливная арматура" else group
        group = FIX.get(group, group)
        specs = [[label, clean(r[n])[:1].upper() + clean(r[n])[1:] if label == "Страна" else clean(r[n])] for label, n in spec_cols if n is not None and clean(r[n]).strip("-")]
        if "СНЯТО С ПРОИЗВОДСТВА" in r[ci["Артикул"]]:
            specs.append(["Статус", "снят с производства"])
        seen = {k.lower() for k, _ in specs} | SKIP_PROPS
        for key in ("Черты", "Дополнительные свойства"):
            for line in (r[ci[key]] if ci[key] is not None else "").splitlines():
                k, _, v = line.partition(":")
                if v.strip() and k.strip().lower() not in seen and len(k) < 60:
                    specs.append([k.strip(), clean(v)])
                    seen.add(k.strip().lower())
        text = "\n\n".join(clean(r[ci[k]]) if k == "Описание" else r[ci[k]].strip()
                           for k in ("Описание", "Отличительные черты") if ci[k] is not None and r[ci[k]].strip())
        photos = [r[ci[k]].strip() for k in PHOTOS[name] + (["Фото 1"] if ci["Фото 1"] is not None else []) if ci[k] is not None]
        docs = [{"name": label, "url": r[ci[k]].strip()} for k, label in DOCS.items() if ci[k] is not None and is_url(r[ci[k]].strip())]
        docs += [{"name": "Фото и схема на Яндекс Диске", "url": p} for p in photos if is_url(p, "disk.yandex")][:1]
        items[sku] = {
            "item": {"sku": sku, "name": nm, "unit": "шт", "eur": number(r[ci["РРЦ ЕВРО"]]) if ci["РРЦ ЕВРО"] is not None else None,
                     "rub": round(price, 2), "sub": clean(r[sub_col]) if sub_col is not None else "", "group": group},
            # у KK POL второй код в скобках («SPP/105/0/K (350/PPB/097-00-00)») — по нему фото в AMANA_Site
            "codes": [sku] + re.findall(r"[\w.\-]+/[\w.\-]+/[\w.\-/]+", r[ci["Артикул"]] + " " + r[ci["Наименование"]]),
            "photos": [p for p in photos if is_url(p, r"\.(jpe?g|png|webp)(\?|$)")],
            "card": {"title": "", "text": text, "docs": docs, "specs": specs,
                     "url": r[ci["Ссылка на сайт"]].strip() if ci["Ссылка на сайт"] is not None and is_url(r[ci["Ссылка на сайт"]].strip()) else ""},
            "stock": {s: number(r[n]) or 0 for s, n in stores.items() if n is not None},
        }
    return items


def fetch(url, prefix):
    ext = re.search(r"\.(jpe?g|png|webp)", url, re.I).group(1).lower().replace("jpeg", "jpg")
    dst = WWW / "img" / f"{prefix}-{hashlib.md5(url.encode()).hexdigest()[:12]}.{ext}"
    for f in (dst, dst.with_suffix(".webp")):
        if f.exists():
            return f"img/{f.name}"
    try:
        data = get(urllib.parse.quote(url, safe=":/%?&=[]"), binary=True)
    except Exception as e:  # noqa: BLE001 — одна битая ссылка не должна ронять весь импорт
        print("  нет фото:", url, e)
        return None
    if not data or not (data[:3] == b"\xff\xd8\xff" or data[:4] in (b"\x89PNG", b"RIFF")):
        print("  не картинка:", url)
        return None
    dst.write_bytes(data)
    return f"img/{dst.name}"


def amana_kkpol(root):
    if not root:
        return {}
    data = json.loads((Path(root) / "site" / "kkpol.json").read_text(encoding="utf-8"))
    return {p["sku"]: Path(root) / p["img"] for p in data["products"] if p.get("img")}


def main(amana=None):
    price, stock = load("price.js"), load("stock.js")
    fallback = amana_kkpol(amana)
    cards, found = {}, {s: {} for s, _, _ in STORES}
    for name in TABS:
        items = read(name)
        prefix = "deante" if name.startswith("Deante") else "kkpol"
        with ThreadPoolExecutor(8) as pool:
            photos = list(pool.map(lambda it: [p for p in (fetch(u, prefix) for u in it["photos"]) if p], items.values()))
        groups = {}
        for it, imgs in zip(items.values(), photos):
            sku = it["item"]["sku"]
            src = next((fallback[c] for c in it["codes"] if c in fallback and fallback[c].exists()), None)
            if not imgs and src:
                dst = WWW / "img" / f"kkpol-amana-{src.stem.lower()}.webp"
                if not dst.exists():
                    shutil.copy(src, dst.with_suffix(src.suffix.lower()))
                    dst = dst.with_suffix(src.suffix.lower())
                imgs = [f"img/{dst.name}"]
            cards[sku] = {**it["card"], "images": imgs}
            groups.setdefault(it["item"].pop("group"), []).append(it["item"])
            for s, n in it["stock"].items():
                found[s][sku] = n
        sheet = {"name": name, "title": "Рекомендованные розничные цены, с НДС",
                 "groups": [{"name": g, "items": sorted(v, key=lambda i: i["sub"])} for g, v in groups.items()]}
        price["sheets"] = [s for s in price["sheets"] if s["name"] != name] + [sheet]
        n = len(items)
        print(f"{name}: {n} позиций, {len(groups)} групп, с фото {sum(bool(p) for p in photos)}")
    (WWW / "price.js").write_text("window.PRICE = " + json.dumps(price, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    save(cards)
    date = time.strftime("%d.%m.%Y")
    stock["stores"] = [s for s in stock["stores"] if not s.get("sheets")] + [
        {"name": s, "date": date, "sheets": list(TABS) if s != "Польша" else ["Deante", "Deante кухня"], "transit": transit, "items": found[s]}
        for s, _, transit in STORES]
    (WWW / "stock.js").write_text("window.STOCK = " + json.dumps(stock, ensure_ascii=False) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
