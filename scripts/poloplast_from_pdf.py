"""Фото для вкладки Poloplast из русского каталога Poloplast (PDF на сайте TECE).

Запуск: python scripts/poloplast_from_pdf.py TG_2020_POLOPLAST_RU.pdf
PDF: https://www.tece.com/sites/default/files/media-documents/main/2020-07/TG_2020_POLOPLAST_RU.pdf
Нужен pdfimages (poppler-utils).

Коды прайса (P2320…) в каталоге не встречаются, поэтому фото подбирается по типу детали и серии:
каждому правилу «слова в названии → страница и номер картинки в PDF» соответствует фото этого типа.
Одно фото на тип — у разных диаметров и углов картинка общая. Дописывает www/catalog.js.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, load, save  # noqa: E402

PDF_URL = "https://www.tece.com/sites/default/files/media-documents/main/2020-07/TG_2020_POLOPLAST_RU.pdf"

# (серия, регулярное выражение по названию, (страница, номер картинки по pdfimages -list)); первое совпадение выигрывает
RULES = [
    ("3S", r"EHP", (44, 173)),
    ("3S", r"Ревизия", (38, 129)),
    ("3S", r"угловая", (37, 127)),
    ("3S", r"Крестовина", (37, 122)),
    ("3S", r"параллельными", (37, 124)),
    ("3S", r"Тройник.*\b45\b", (36, 114)),
    ("3S", r"Тройник", (36, 116)),
    ("3S", r"Надвижная", (38, 133)),
    ("3S", r"Компенсационный", (38, 135)),
    ("3S", r"раструбная муфта", (38, 131)),
    ("3S", r"Отвод", (35, 112)),
    ("3S", r"Переходной патрубок", (37, 118)),
    ("3S", r"Труба", (34, 110)),
    ("NG", r"EHP", (43, 168)),
    ("NG", r"Заглушка", (23, 47)),
    ("NG", r"Адаптер для присоединения слива конденсата", (24, 56)),
    ("NG", r"Конденсатосборник", (24, 51)),
    ("NG", r"угловая", (19, 18)),
    ("NG", r"смещенными осями", (20, 27)),
    ("NG", r"ответвлением в одну сторону", (20, 24)),
    ("NG", r"Крестовина.*\b45\b", (18, 13)),
    ("NG", r"Крестовина", (18, 14)),
    ("NG", r"Двухраструбная муфта", (23, 43)),
    ("NG", r"Надвижная муфта", (23, 45)),
    ("NG", r"Отвод с разворотом", (24, 49)),
    ("NG", r"Отвод сифонный длинный", (25, 63)),
    ("NG", r"Отвод сифонный", (25, 60)),
    ("NG", r"Сифонный фитинг", (25, 58)),
    ("NG", r"Уплотнительное кольцо раструба.*старого", (26, 68)),
    ("NG", r"Уплотнительное кольцо раструба", (26, 66)),
    ("NG", r"Уплотнительное кольцо к унитазу", (27, 80)),
    ("NG", r"Тройник к унитазу", (26, 74)),
    ("NG", r"Соединитель к унитазу", (26, 72)),
    ("NG", r"Переходник к унитазу", (26, 70)),
    ("NG", r"Отвод", (15, 4)),
    ("NG", r"муфта-переходник.*накидной гайкой", (31, 98)),
    ("NG", r"муфта-переходник.*наружной резьбой", (31, 100)),
    ("NG", r"Разъединенная муфта", (32, 103)),
    ("NG", r"Соединение фланцевое", (32, 105)),
    ("NG", r"Фланец", (32, 107)),
    ("NG", r"соосный", (22, 37)),
    ("NG", r"Переходной патрубок.*короткий", (21, 33)),
    ("NG", r"Переходной патрубок", (21, 31)),
    ("NG", r"Ревизия", (22, 39)),
    ("NG", r"Уплотнение для соединения раструба", (42, 165)),
    ("", r"Патрубок для соединения чугунной трубы с раструбом", (41, 157)),
    ("NG", r"чугунным или фиброцементным раструбом", (40, 149)),
    ("NG", r"чугунным раструбом", (41, 155)),
    ("NG", r"чугунной или фиброцементной трубой", (40, 153)),
    ("NG", r"раструбом POLO-KAL NG до", (42, 163)),
    ("NG", r"параллельными", (18, 17)),
    ("NG", r"трубный конец", (17, 11)),
    ("NG", r"Тройник.*\b45\b", (16, 7)),
    ("NG", r"Тройник", (17, 10)),
    ("NG", r"Компенсационный", (22, 41)),
    ("NG", r"Труба", (13, 0)),
    ("", r"Жиростойкое", (28, 85)),
    ("", r"Силиконовое", (28, 87)),
    ("", r"чугунными трубами", (42, 167)),
    ("", r"двойное уплотнительное", (39, 143)),
    ("", r"уплотнительное кольцо", (28, 83)),
    ("", r"Лубрикант", (27, 82)),
    ("", r"Соединительный хомут", (29, 89)),
    ("", r"POLO-CLIP HS", (45, 177)),
    ("", r"POLO-CLIP", (46, 180)),
    ("", r"Опорная пластина|шумоизолирующих элементов", (47, 185)),
    ("", r"Шпилька", (47, 183)),
    ("", r"винтовой хомут", (47, 192)),
]


def series(name):
    return "3S" if "3S" in name else "NG" if "NG" in name else ""


def pick(name):
    for ser, pattern, ref in RULES:
        if (not ser or ser == series(name)) and re.search(pattern, name, re.I):
            return ref
    return None


def main(pdf):
    assert shutil.which("pdfimages"), "Нужен pdfimages (poppler-utils)"
    price = load("price.js")
    items = [i for s in price["sheets"] if s["name"] == "Poloplast" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    new, unmatched = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-png", "-p", "-f", "13", "-l", "47", pdf, f"{tmp}/x"], check=True)
        for i in items:
            if catalog.get(i["sku"], {}).get("images"):
                continue
            ref = pick(i["name"])
            if not ref:
                unmatched.append(i["name"])
                continue
            page, num = ref
            src = Path(tmp) / f"x-{page:03d}-{num:03d}.png"
            assert src.exists(), f"В PDF нет картинки {page}/{num} — изменился каталог?"
            dst = WWW / "img" / f"poloplast-p{page}-{num}.png"
            if not dst.exists():
                shutil.copy(src, dst)
            new[i["sku"]] = {"title": "", "text": "", "images": [f"img/{dst.name}"], "docs": [{"name": "Каталог Poloplast 2020", "url": PDF_URL}], "url": ""}
    save(new)
    print(f"Poloplast: фото по типу детали для {len(new)} из {len(items)}; без правила {len(unmatched)}:")
    for n in sorted(set(unmatched)):
        print("  ", n)


if __name__ == "__main__":
    main(sys.argv[1])
