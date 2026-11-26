"""Собирает с spring.tececatalog.ru фото, описание и документы для артикулов из price.js.

Запуск: python scripts/scrape_catalog.py
Пишет www/catalog.js и скачивает фото в www/img/.
"""
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://spring.tececatalog.ru"
WWW = Path(__file__).resolve().parent.parent / "www"
HEADERS = {"User-Agent": "Mozilla/5.0 (catalog sync)"}


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


def price_skus():
    src = (WWW / "price.js").read_text(encoding="utf-8")
    data = json.loads(src[src.index("{"): src.rindex("}") + 1])
    return {i["sku"] for s in data["sections"] for i in s["items"]}


def text_of(fragment):
    """HTML описания → текст: <br> и абзацы в переводы строк, пункты списков с «• »."""
    t = re.sub(r"(?is)<(script|style|svg).*?</\1>", "", fragment)
    t = re.sub(r"(?i)<li[^>]*>", "\n• ", t)
    t = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</ul>|</div>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", "", t)).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")]
    out = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def parse_product(page):
    sku = re.search(r'itemprop="name">Артикул:</span>\s*<span class="value" itemprop="value">([^<]+)<', page)
    # варианты товара (длины, цвета) перечислены в таблице предложений; лишние ячейки отсеет фильтр по прайсу
    skus = [sku.group(1)] if sku else []
    skus += re.findall(r'class="divTableCell property">\s*([A-Z0-9][\w.-]{3,})\s*<', page)
    if not skus:
        return None
    title = re.search(r'<h1 class="no_standard_size_show">(.*?)</h1>', page, re.S)
    descr = re.search(r'class="element_detail_text2[^"]*"[^>]*>(.*?)<div class="bg_element_detail_text2', page, re.S)
    # полноразмерные фото лежат в ссылках галереи; resize_cache 700×700 — то же фото, но легче
    full = list(dict.fromkeys(re.findall(r'href="(/upload/iblock/[^"]+\.(?:jpe?g|png|webp))"', page, re.I)))
    small = {Path(p).name: p for p in re.findall(r'src="(/upload/resize_cache/iblock/[^"]*/700_700_[^"]+)"', page)}
    images = [small.get(Path(p).name, p) for p in full]
    docs = [{"name": html.unescape(Path(urllib.parse.unquote(p)).stem), "url": BASE + p}
            for p in dict.fromkeys(re.findall(r'href="(/upload/[^"]+\.pdf)"', page, re.I))]
    return {
        "skus": [html.unescape(x).strip() for x in dict.fromkeys(skus)],
        "main": bool(sku),
        "title": html.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip() if title else "",
        "text": text_of(descr.group(1)) if descr else "",
        "images": images,
        "docs": docs,
    }


def crawl():
    seen, queue, products = set(), ["/catalog/"], {}
    while queue:
        path = queue.pop(0)
        if path in seen or "/sistemy_truboprovodov/" in path:  # трубопроводы не входят во вкладку
            continue
        seen.add(path)
        page = get(BASE + path)
        time.sleep(0.3)
        p = parse_product(page)
        if p:
            p["url"] = BASE + path
            for n, sku in enumerate(p["skus"]):
                # основной артикул страницы важнее упоминания в чужой таблице вариантов
                if n == 0 and p["main"] or sku not in products:
                    products[sku] = p
            continue
        for link in re.findall(r'href="(/catalog/[^"?#]+/(?:\?PAGEN_\d+=\d+)?)"', page):
            if link not in seen:
                queue.append(link)
    print(f"страниц: {len(seen)}, товаров с артикулом: {len(products)}")
    return products


def main():
    wanted = price_skus()
    found = {sku: p for sku, p in crawl().items() if sku in wanted}
    catalog = {}
    (WWW / "img").mkdir(exist_ok=True)
    for sku, p in sorted(found.items()):
        files = []
        for src in p["images"]:
            # одно фото часто стоит у нескольких артикулов (комплекты, схемы запчастей): храним его один раз
            key = re.search(r"/iblock/\w+/(\w+)/", src).group(1)
            f = WWW / "img" / (key + Path(src).suffix.lower())
            if not f.exists():
                f.write_bytes(get(BASE + urllib.parse.quote(src), binary=True))
                time.sleep(0.2)
            files.append(f"img/{f.name}")
        catalog[sku] = {"title": p["title"], "text": p["text"], "images": files, "docs": p["docs"], "url": p["url"]}
    (WWW / "catalog.js").write_text(
        "window.CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    missing = sorted(wanted - set(catalog))
    print(f"найдено {len(catalog)} из {len(wanted)}; без карточки: {', '.join(missing) or 'нет'}")


if __name__ == "__main__":
    main()
