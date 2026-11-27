"""Фото для вкладки Conex Banninger из официального листа ассортимента >B< Press Inox.

Запуск: python scripts/conex_from_pdf.py B_-Press-Inox-Product-Range-Sheet.pdf
PDF: https://conexbanninger.com/wp-content/uploads/2024/02/B_-Press-Inox-Product-Range-Sheet.pdf
Нужен pdfimages (poppler-utils).

В артикуле прайса зашит тип детали Conex: PS5301… — заглушка, PS4330… — разъёмное соединение и т.д.
На 2-й странице листа таблица: фото, название и код PS каждого типа; номера картинок ниже сверены с ней.
Одно фото на тип, для всех размеров. Типы, которых в листе нет, не трогаются.
Фото, поставленные раньше из австралийского каталога (img/conex-…), заменяются этими: они крупнее.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, load, save  # noqa: E402

PDF_URL = "https://conexbanninger.com/wp-content/uploads/2024/02/B_-Press-Inox-Product-Range-Sheet.pdf"

# тип Conex → номер картинки на стр. 2 (pdfimages -list) и подпись ячейки в листе
TYPES = {
    "5270": (1, "Straight Coupler"),
    "4275": (5, "Slip Coupler"),
    "4270": (2, "Female Straight Coupler"),
    "4243": (12, "Male Straight Coupler"),
    "4330": (14, "Female Straight Union Connector"),
    "4331": (18, "Male Straight Union Connector"),
    "4355": (8, "Flat Face Union"),
    "5243": (6, "Fitting Reducer"),
    "5002": (9, "90° Bend"),
    "5001": (13, "90° Street Bend"),
    "4001": (15, "Bend with Male Thread"),
    "4090": (19, "90° Bend with Female Thread"),
    "4002": (3, "90° Female Iron Bend"),
    "5041": (10, "45° Obtuse Elbow"),
    "5040": (11, "45° Obtuse Street Elbow"),
    "5130": (16, "Equal Tee"),
    "4130": (0, "Tee with Female Branch"),
    "5088": (4, "Cross Over (long)"),
    "5087": (7, "Part Cross Over (short)"),
    "5030": (20, "Male Street Bend"),
    "4471": (21, "Wall Plate Elbow"),
    "5301": (22, "Stop End"),
}
REDUCING_TEE = (17, "Tee with Reduced Branch")
TUBE = (23, "Stainless Steel Tube")


def pick(item):
    if item["sku"].startswith("PSTUBE"):
        return TUBE
    m = re.match(r"PS(\d{4})", item["sku"])
    if not m or m.group(1) not in TYPES:
        return None
    if m.group(1) == "5130":
        sizes = re.findall(r"\d+", item["name"].split(",")[1]) if "," in item["name"] else []
        if len(set(sizes)) > 1:  # «Тройник …, 54 х 28 х 54» — ответвление другого диаметра
            return REDUCING_TEE
    return TYPES[m.group(1)]


def main(pdf):
    assert shutil.which("pdfimages"), "Нужен pdfimages (poppler-utils)"
    price = load("price.js")
    items = [i for s in price["sheets"] if s["name"] == "Conex Banninger" for g in s["groups"] for i in g["items"]]
    catalog = load("catalog.js")
    new, skipped = {}, {}
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-png", "-p", "-f", "2", "-l", "2", pdf, f"{tmp}/x"], check=True)
        for i in items:
            old = catalog.get(i["sku"], {}).get("images", [])
            if old and not all(p.startswith("img/conex-") for p in old):
                continue  # фото из другого источника не трогаем
            ref = pick(i)
            if not ref:
                key = (re.match(r"PS(\d{4})", i["sku"]) or [None, i["name"].split(",")[0]])[1]
                skipped[key] = skipped.get(key, 0) + 1
                continue
            src = Path(tmp) / f"x-002-{ref[0]:03d}.png"
            assert src.exists(), f"В PDF нет картинки {ref} — изменился лист?"
            dst = WWW / "img" / f"conex-range-{ref[0]:02d}.png"
            if not dst.exists() and not dst.with_suffix(".webp").exists():
                shutil.copy(src, dst)
            name = dst.name if dst.exists() else dst.with_suffix(".webp").name
            new[i["sku"]] = {"title": "", "text": "", "images": [f"img/{name}"],
                             "docs": [{"name": "Conex Bänninger >B< Press Inox — ассортимент", "url": PDF_URL}], "url": ""}
    save(new)
    print(f"Conex: фото по типу детали для {len(new)} из {len(items)}; без фото по типам: {skipped}")


if __name__ == "__main__":
    main(sys.argv[1])
