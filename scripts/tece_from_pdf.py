"""Фото для позиций «Сантехники ТЕСЕ», которых нет на tecegerman.ru, из официального каталога TECE 01.2026.

Запуск: python scripts/tece_from_pdf.py "Каталог Сантехнические системы 01.2026.pdf"
PDF: https://www.tece.com/sites/default/files/media-documents/main/2025-12/Каталог%20Сантехнические%20системы%2001.2026.pdf
Нужен pdfimages (poppler-utils).

Каждое правило проверено по странице каталога: артикул стоит на этой странице, картинка — фото этого товара.
Позиции, у которых в каталоге фото другого цвета (TECEloop из зелёного стекла, «пергамон»), не трогаются.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, load, save  # noqa: E402

PDF_URL = "https://www.tece.com/sites/default/files/media-documents/main/2025-12/%D0%9A%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3%20%D0%A1%D0%B0%D0%BD%D1%82%D0%B5%D1%85%D0%BD%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B5%20%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B%2001.2026.pdf"

# (артикул или слова в названии, «страница-номер» картинки по pdfimages -list)
RULES = [
    (r"^9030030$", "145-223"),          # Кронштейн TECEprofil двойной для тонких перегородок
    (r"^9030031$", "145-224"),          # Консольный кронштейн TECEprofil
    (r'Решетка "lines"', "171-256"),
    (r'Решетка "royal"', "172-258"),
    (r'угл\. "steel II"', "175-263"),
    (r"Базовая решетка 150", "201-306"),
]


def pick(item):
    for pattern, ref in RULES:
        if re.search(pattern, item["sku"]) or re.search(pattern, item["name"]):
            return ref
    return None


def main(pdf):
    assert shutil.which("pdfimages"), "Нужен pdfimages (poppler-utils)"
    price = load("price.js")
    items = [i for s in price["sheets"] if s["name"] == "Сантехника ТЕСЕ" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    new = {}
    with tempfile.TemporaryDirectory() as tmp:
        # номера картинок pdfimages считает от первой извлекаемой страницы — правила выше сверены от стр. 44
        subprocess.run(["pdfimages", "-png", "-p", "-f", "44", "-l", "201", pdf, f"{tmp}/x"], check=True)
        for i in items:
            ref = None if catalog.get(i["sku"], {}).get("images") else pick(i)
            if not ref:
                continue
            src = Path(tmp) / f"x-{ref}.png"
            assert src.exists(), f"В PDF нет картинки {ref} — изменился каталог?"
            dst = WWW / "img" / f"tece-2026-{ref}.png"
            if not dst.exists():
                shutil.copy(src, dst)
            new[i["sku"]] = {"title": "", "text": "", "images": [f"img/{dst.name}"],
                             "docs": [{"name": "Каталог TECE «Сантехнические системы» 01.2026", "url": PDF_URL}], "url": ""}
    save(new)
    print(f"TECE: фото из каталога 01.2026 для {len(new)} позиций")


if __name__ == "__main__":
    main(sys.argv[1])
