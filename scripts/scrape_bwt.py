"""Фото для вкладки BWT с bwt.ru: поиск по артикулу → страница товара → фото галереи (470×470).

Запуск: python scripts/scrape_bwt.py            — поиск по артикулу
        python scripts/scrape_bwt.py --catalog  — обход всего каталога bwt.ru, для того, что поиск не нашёл
Дописывает www/catalog.js; позиции, у которых фото уже есть, не трогает.
"""
import hashlib
import html
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


def download(page):
    files = []
    for src in gallery(page):
        # имена вроде IMG_6907.png повторяются у разных товаров — добавляем папку из пути
        # имя только латиницей: файлы с кириллицей и пробелами сборка Android не кладёт в APK
        name = Path(urllib.parse.unquote(src)).name
        f = WWW / "img" / f"bwt-{re.search(r'iblock/(\w+)/', src).group(1)}-{hashlib.md5(name.encode()).hexdigest()[:10]}{Path(name).suffix.lower()}"
        if not f.exists():
            try:
                f.write_bytes(get(BASE + urllib.parse.quote(src, safe="/%"), binary=True))
            except Exception as e:
                print(f"  ! {src}: {e}")
                continue
            time.sleep(0.2)
        files.append(f"img/{f.name}")
    return files[:6]


def from_search(missing, new):
    for sku in missing:
        link = find_product(sku)
        time.sleep(0.3)
        if link:
            files = download(get(BASE + link))
            if files:
                new[sku] = {"title": "", "text": "", "images": files, "docs": [], "url": BASE + link}
                if len(new) % 20 == 0:
                    save(new)  # обход долгий — сохраняем по ходу, чтобы обрыв не терял найденное


def from_catalog(missing, new):
    """Обходит каталог (для частных и юридических лиц) и ищет артикулы на страницах товаров."""
    queue = [f"/catalog/?visitor_type={v}" for v in ("fiz", "yur")]
    seen, products = set(), set()
    while queue and len(seen) < 600:  # shortcut: не больше 600 страниц каталога; хватает на весь bwt.ru сейчас
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            page = get(BASE + url)
        except Exception as e:
            print(f"  ! {url}: {e}")
            continue
        time.sleep(0.3)
        products.update(re.findall(r'href="(/product/[^"?#]+)', page))
        queue += [html.unescape(u) for u in re.findall(r'href="(/catalog/[^"#]*(?:visitor_type|PAGEN)[^"#]*)"', page)]
    print(f"каталог: {len(seen)} страниц, {len(products)} товаров")
    left = set(missing)
    for link in sorted(products):
        if not left:
            break
        try:
            page = get(BASE + link)
        except Exception as e:
            print(f"  ! {link}: {e}")
            continue
        time.sleep(0.3)
        text = re.sub(r"<[^>]+>", " ", page)
        for sku in [k for k in left if re.search(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])", text)]:
            files = download(page)
            if files:
                new[sku] = {"title": "", "text": "", "images": files, "docs": [], "url": BASE + link}
                left.discard(sku)
        if len(new) and len(new) % 20 == 0:
            save(new)


def main(mode="search"):
    price = load("price.js")
    wanted = [i["sku"] for s in price["sheets"] if s["name"] == "BWT" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    missing = [k for k in wanted if not catalog.get(k, {}).get("images")]
    new = {}
    (from_catalog if mode == "--catalog" else from_search)(missing, new)
    catalog = save(new)
    missing = [k for k in wanted if not catalog.get(k, {}).get("images")]
    print(f"BWT: фото добавлено для {len(new)}; без фото {len(missing)} из {len(wanted)}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
