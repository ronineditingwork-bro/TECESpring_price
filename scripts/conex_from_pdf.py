"""Фото для вкладки Conex Banninger из технического каталога >B< Press Stainless Steel.

Запуск: python scripts/conex_from_pdf.py Technical-Guide-Conex-Banninger-B-Press-Stainless-Steel.pdf
PDF (официальный каталог Conex Bänninger у дистрибьютора Reece):
https://digitalassets.reecegroup.com.au/m/6360cb4c5313dc93/original/Technical-Guide-Conex-Banninger-B-Press-Stainless-Steel.pdf
Нужен pdfimages (poppler-utils).

В артикуле прайса зашит тип детали Conex: PS5301… — заглушка, PS5130… — тройник и т.д.
Фото берётся со страницы «Product Range» каталога по подписи типа; одно фото на тип, для всех размеров.
Типы, которых в каталоге нет, не трогаются — лучше без фото, чем с чужим.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, load, save  # noqa: E402

PDF_URL = "https://digitalassets.reecegroup.com.au/m/6360cb4c5313dc93/original/Technical-Guide-Conex-Banninger-B-Press-Stainless-Steel.pdf"

# тип Conex (4 цифры после PS) → картинка «страница-номер» по pdfimages -list и подпись в каталоге
TYPES = {
    "5270": ("010-000", "Straight Connector"),
    "4275": ("010-006", "Slip Coupling"),
    "5243": ("010-008", "Fitting Reducer"),
    "4243": ("010-009", "Male Coupling"),
    "4270": ("010-010", "Female Coupling"),
    "5002": ("010-011", "Elbow - 90 Degree"),
    "5001": ("010-012", "Elbow Plain End - 90 Degree"),
    "5041": ("010-013", "Elbow - 45 Degree"),
    "5040": ("010-014", "Elbow Plain End - 45 Degree"),
    "4092": ("010-002", "Elbow - Male 90 Degree"),
    "4001": ("010-002", "Elbow - Male 90 Degree"),
    "5130": ("010-003", "Tee"),
    "5301": ("010-005", "Stop End"),
}
REDUCING_TEE = ("010-004", "Reducing Tee")


def pick(item):
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
        subprocess.run(["pdfimages", "-png", "-p", "-f", "10", "-l", "11", pdf, f"{tmp}/x"], check=True)
        for i in items:
            if catalog.get(i["sku"], {}).get("images"):
                continue
            ref = pick(i)
            if not ref:
                key = (re.match(r"PS(\d{4})", i["sku"]) or [None, i["name"].split(",")[0]])[1]
                skipped[key] = skipped.get(key, 0) + 1
                continue
            src = Path(tmp) / f"x-{ref[0]}.png"
            assert src.exists(), f"В PDF нет картинки {ref[0]} — изменился каталог?"
            dst = WWW / "img" / f"conex-{ref[0]}.png"
            if not dst.exists():
                shutil.copy(src, dst)
            new[i["sku"]] = {"title": "", "text": "", "images": [f"img/{dst.name}"],
                             "docs": [{"name": "Каталог Conex Bänninger >B< Press Stainless Steel", "url": PDF_URL}], "url": ""}
    save(new)
    print(f"Conex: фото по типу детали для {len(new)} из {len(items)}; без фото по типам: {skipped}")


if __name__ == "__main__":
    main(sys.argv[1])
