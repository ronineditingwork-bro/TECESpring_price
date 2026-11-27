"""Фото для вкладки BWT с bwt.ru: поиск по артикулу → страница товара → фото галереи (470×470).

Запуск: python scripts/scrape_bwt.py
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

BASE = "https://www.bwt.ru"


def find_product(sku):
    page = get(f"{BASE}/search/?q={urllib.parse.quote(sku)}")
    # результат: <h3><b>810376</b> Название</h3> … <a href="/product/…">Подробнее</a>
    for title, link in re.findall(r'search__item_title">\s*<h3>(.*?)</h3>.*?href="(/product/[^"?]+)', page, re.S):
        if re.sub(r"<[^>]+>", " ", title).split()[:1] == [sku]:
            return link
    return None


def gallery(page):
    """Фото галереи товара: миниатюры 92×92 перечисляют её кадры; для каждого берём самую крупную версию со страницы."""
    shots = []
    for thumb in dict.fromkeys(re.findall(r'"/upload/resize_cache/(iblock/\w+/(?:\w+/)?)92_92_\w+/([^"/]+\.(?:jpe?g|png))"', page, re.I)):
        folder, name = thumb
        sizes = re.findall(r'"(/upload/resize_cache/' + re.escape(folder) + r'(\d+)_\d+_\w+/' + re.escape(name) + ')"', page)
        big = max(((int(w), u) for u, w in sizes if int(w) >= 400), default=None)
        shots.append(big[1] if big else f"/upload/{folder}{name}")
    return shots


def main():
    price = load("price.js")
    wanted = [i["sku"] for s in price["sheets"] if s["name"] == "BWT" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    added, new = 0, {}
    for sku in wanted:
        if catalog.get(sku, {}).get("images"):
            continue
        link = find_product(sku)
        time.sleep(0.3)
        if not link:
            continue
        page = get(BASE + link)
        files = []
        for src in gallery(page):
            # имена вроде IMG_6907.png повторяются у разных товаров — добавляем папку из пути
            f = WWW / "img" / ("bwt-" + re.search(r"iblock/(\w+)/", src).group(1) + "-" + Path(src).name.lower())
            if not f.exists():
                f.write_bytes(get(BASE + urllib.parse.quote(src, safe="/%"), binary=True))
                time.sleep(0.2)
            files.append(f"img/{f.name}")
        if files:
            new[sku] = {"title": "", "text": "", "images": files[:6], "docs": [], "url": BASE + link}
            added += 1
            if added % 20 == 0:
                save(new)  # обход долгий — сохраняем по ходу, чтобы обрыв не терял найденное
    catalog = save(new)
    missing = [k for k in wanted if not catalog.get(k, {}).get("images")]
    print(f"BWT: фото добавлено для {added}; без фото {len(missing)} из {len(wanted)}")


if __name__ == "__main__":
    main()
