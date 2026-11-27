"""Фото для позиций прайса с сайта на Tilda (например, uranum-russia.ru).

Запуск: python scripts/scrape_tilda.py https://uranum-russia.ru Uranum
Обходит страницы сайта, ищет на каждой артикулы указанной вкладки прайса и берёт фото этой страницы.
Картинки, которые есть на многих страницах (логотип, шапка), отбрасываются. Фото скачиваются
уменьшенными до 700 px через thb.tildacdn.com и дописываются в www/catalog.js; уже найденные карточки не трогаются.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

WWW = Path(__file__).resolve().parent.parent / "www"
HEADERS = {"User-Agent": "Mozilla/5.0 (catalog sync)"}
IMG = re.compile(r'(?:data-original|src|data-img-zoom-url)="https://static\.tildacdn\.com/(tild[\w-]+)/([^"/]+\.(?:jpe?g|png|webp))"', re.I)
MAX_PAGES = 300


def get(url, binary=False):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def load(name):
    src = (WWW / name).read_text(encoding="utf-8")
    return json.loads(src[src.index("{"): src.rindex("}") + 1])


def save(new):
    """Дописывает карточки в www/catalog.js, перечитав файл прямо перед записью: скрипты могут работать одновременно."""
    catalog = load("catalog.js") if (WWW / "catalog.js").exists() else {}
    catalog.update(new)
    (WWW / "catalog.js").write_text("window.CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    return catalog


def crawl(base):
    host = urllib.parse.urlparse(base).netloc
    seen, queue, pages = set(), ["/"], {}
    while queue and len(seen) < MAX_PAGES:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        try:
            page = get(base + path)
        except Exception as e:
            print(f"  ! {path}: {e}")
            continue
        time.sleep(0.3)
        pages[path] = page
        for link in re.findall(r'href="(?:https?://' + re.escape(host) + r')?(/[^"#?]*)"', page):
            if not re.search(r"\.(css|js|png|jpe?g|svg|ico|pdf|webp)$", link, re.I) and link not in seen:
                queue.append(link)
    return pages


def main(base, sheet_name):
    base = base.rstrip("/")
    price = load("price.js")
    wanted = [i["sku"] for s in price["sheets"] if s["name"] == sheet_name for g in s["groups"] for i in g["items"]]
    assert wanted, f"Нет вкладки «{sheet_name}» в price.js"
    pages = crawl(base)
    imgs = {p: list(dict.fromkeys(IMG.findall(html))) for p, html in pages.items()}
    common = Counter(i for v in imgs.values() for i in set(v))
    best = {}  # артикул → (сколько артикулов на странице, страница); самая узкая страница точнее всего
    for path, html in pages.items():
        found = [k for k in wanted if re.search(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])", html)]
        for k in found:
            if k not in best or len(found) < best[k][0]:
                best[k] = (len(found), path)

    catalog = load("catalog.js") if (WWW / "catalog.js").exists() else {}
    (WWW / "img").mkdir(exist_ok=True)
    added, new = 0, {}
    for sku, (_, path) in sorted(best.items()):
        if catalog.get(sku, {}).get("images"):
            continue
        files = []
        for tild, name in imgs[path]:
            if common[(tild, name)] > 2:  # логотипы и баннеры со всех страниц
                continue
            f = WWW / "img" / (tild + Path(name).suffix.lower())
            if not f.exists():
                f.write_bytes(get(f"https://thb.tildacdn.com/{tild}/-/resize/700x/{urllib.parse.quote(name)}", binary=True))
                time.sleep(0.2)
            files.append(f"img/{f.name}")
        if files:
            new[sku] = {"title": "", "text": "", "images": files[:6], "docs": [], "url": base + path}
            added += 1
    catalog = save(new)
    missing = [k for k in wanted if not catalog.get(k, {}).get("images")]
    print(f"страниц: {len(pages)}; фото добавлено для {added}; без фото {len(missing)} из {len(wanted)}: {', '.join(missing) or 'нет'}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
