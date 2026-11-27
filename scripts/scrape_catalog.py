"""Собирает с spring.tececatalog.ru фото, описание и документы для артикулов из price.js.

Запуск: python scripts/scrape_catalog.py [https://spring.tececatalog.ru | https://tecegerman.ru]
Пишет www/catalog.js и скачивает фото в www/img/.
"""
import html
import json
import re
import sys
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
    return {i["sku"] for s in data["sheets"] for g in s["groups"] for i in g["items"]}


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
        if path in seen:
            continue
        seen.add(path)
        try:
            page = get(BASE + path)
        except Exception as e:  # один сбой связи не должен обрывать обход всего сайта
            print(f"  ! {path}: {e}")
            continue
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


def main(base=BASE):
    global BASE
    BASE = base.rstrip("/")
    wanted = price_skus()
    found = {sku: p for sku, p in crawl().items() if sku in wanted}
    # дописываем к уже собранным карточкам (другие сайты, другие вкладки), найденные раньше не трогаем
    old = (WWW / "catalog.js").read_text(encoding="utf-8") if (WWW / "catalog.js").exists() else "{}"
    catalog = json.loads(old[old.index("{"): old.rindex("}") + 1])
    found = {sku: p for sku, p in found.items() if not catalog.get(sku, {}).get("images")}
    (WWW / "img").mkdir(exist_ok=True)
    for sku, p in sorted(found.items()):
        files = []
        for src in p["images"]:
            # одно фото часто стоит у нескольких артикулов (комплекты, схемы запчастей): храним его один раз
            m = re.search(r"/iblock/(\w+)/(?:(?!\d+_\d+_)(\w{20,})/)?", src)  # хеш-папки бывает нет: …/iblock/d88/<размер>/файл
            key = m.group(2) or f"{m.group(1)}-{Path(src).stem}"
            f = WWW / "img" / (key + Path(src).suffix.lower())
            if not f.exists():
                try:
                    f.write_bytes(get(BASE + urllib.parse.quote(src), binary=True))
                except Exception as e:
                    print(f"  ! {src}: {e}")
                    continue
                time.sleep(0.2)
            files.append(f"img/{f.name}")
        catalog[sku] = {"title": p["title"], "text": p["text"], "images": files, "docs": p["docs"], "url": p["url"]}
    # перечитываем файл перед записью: другие скрипты фото могли дописать его, пока шёл обход сайта
    fresh = (WWW / "catalog.js").read_text(encoding="utf-8")
    fresh = json.loads(fresh[fresh.index("{"): fresh.rindex("}") + 1])
    fresh.update({sku: catalog[sku] for sku in found})
    catalog = fresh
    (WWW / "catalog.js").write_text(
        "window.CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    missing = sorted(k for k in wanted if not catalog.get(k, {}).get("images"))
    print(f"{BASE}: новых карточек {len(found)}; всего с фото {len(wanted) - len(missing)} из {len(wanted)}")


if __name__ == "__main__":
    main(*sys.argv[1:2])
