"""Уменьшает фото для приложения: до 800 px по большей стороне, формат WebP; убирает файлы, на которые не ссылается каталог.

Запуск: python scripts/optimize_images.py
Запускать после скриптов сбора фото: они качают оригиналы (бывают по 2–3 МБ), а в APK всё это попадает целиком.
Нужен Pillow: pip install pillow
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from scrape_tilda import WWW, load, save  # noqa: E402

MAX = 800


def main():
    catalog = load("catalog.js")
    done, saved = {}, 0
    for entry in catalog.values():
        for path in entry["images"]:
            src = WWW / path
            if path in done or src.suffix == ".webp" or not src.exists():
                continue
            dst = src.with_suffix(".webp")
            before = src.stat().st_size
            with Image.open(src) as im:
                im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
                im.thumbnail((MAX, MAX))
                im.save(dst, "WEBP", quality=80, method=6)
            saved += before - dst.stat().st_size
            src.unlink()
            done[path] = f"img/{dst.name}"
    for entry in catalog.values():
        entry["images"] = [done.get(p, p) for p in entry["images"]]
    catalog = save(catalog)

    used = {p for e in catalog.values() for p in e["images"]}
    missing = [p for p in used if not (WWW / p).exists()]
    assert not missing, f"Каталог ссылается на несуществующие файлы: {missing[:5]}"
    removed = 0
    for f in (WWW / "img").iterdir():
        if f"img/{f.name}" not in used:
            saved += f.stat().st_size
            f.unlink()
            removed += 1
    total = sum(f.stat().st_size for f in (WWW / "img").iterdir())
    print(f"переведено в WebP: {len(done)}; удалено лишних: {removed}; освобождено {saved / 1e6:.0f} МБ; фото сейчас {total / 1e6:.0f} МБ")


if __name__ == "__main__":
    main()
