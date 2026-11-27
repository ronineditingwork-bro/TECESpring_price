"""Фото для вкладки Viega с vg-rus.ru (официальный дилер Viega).

Запуск: python scripts/scrape_viega.py
Ищет артикул через поиск сайта и берёт фото, в имени файла которых есть этот артикул
(например PPm3291i268190v01.jpg) — так фото точно относится к позиции, а не к соседней.
Дописывает www/catalog.js; позиции, у которых фото уже есть, не трогает.
"""
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, get, load, save  # noqa: E402

BASE = "https://vg-rus.ru"


def main():
    price = load("price.js")
    wanted = [i["sku"] for s in price["sheets"] if s["name"] == "Viega" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    added, new = 0, {}
    for sku in wanted:
        if catalog.get(sku, {}).get("images"):
            continue
        url = f"{BASE}/poisk/?q={urllib.parse.quote(sku)}"
        page = get(url)
        time.sleep(0.3)
        pics = re.findall(r"https://omnisan\.storage\.yandexcloud\.net/[^\"' )]*/crop/orig/900/[^\"' )]*?[A-Za-z]" + re.escape(sku) + r"v\d+[^\"' )]*\.(?:jpe?g|png|webp)", page)
        files = []
        for src in dict.fromkeys(pics):
            f = WWW / "img" / ("viega-" + Path(urllib.parse.urlparse(src).path).name.lower())
            if not f.exists():
                f.write_bytes(get(src, binary=True))
                time.sleep(0.2)
            files.append(f"img/{f.name}")
        if files:
            new[sku] = {"title": "", "text": "", "images": files[:6], "docs": [], "url": url}
            added += 1
    catalog = save(new)
    missing = [k for k in wanted if not catalog.get(k, {}).get("images")]
    print(f"Viega: фото добавлено для {added}; без фото {len(missing)} из {len(wanted)}")


if __name__ == "__main__":
    main()
