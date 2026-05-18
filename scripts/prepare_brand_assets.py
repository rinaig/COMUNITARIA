from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(r"c:\PROYECTOS_DE_DESARROLLOS\COMUNITARIA")
PUBLIC = ROOT / "public"
BRAND = PUBLIC / "brand"
MEDIA = PUBLIC / "media"

BRAND.mkdir(parents=True, exist_ok=True)
MEDIA.mkdir(parents=True, exist_ok=True)

SOURCE_MAP = {
    ROOT / "Logo.png": (BRAND / "comunitaria-logo.png", "fill"),
    ROOT / "Isotipo solo 1 archivo PNG transparente de 1024 x 1024..png": (BRAND / "comunitaria-isotipo.png", "crop"),
    ROOT / "Favicon simple (512 x 512 píxeles)..png": (BRAND / "favicon-source.png", "crop"),
    ROOT / "Hero principal de comunidad o edificio 1 imagen horizontal de 2400 x 1400.png": (MEDIA / "hero-comunidad.png", "crop"),
    ROOT / "Módulo reservas 1 imagen horizontal de 1600 x 1000.png": (MEDIA / "modulo-reservas.png", "crop"),
    ROOT / "Módulo seguridad o portería 1 imagen horizontal de 1600 x 1000.png": (MEDIA / "modulo-seguridad.png", "crop"),
    ROOT / "Módulo administración o expensas 1 imagen horizontal de 1600 x 1000.png": (MEDIA / "modulo-expensas.png", "crop"),
    ROOT / "Módulo reclamos o mantenimiento 1 imagen horizontal de 1600 x 1000.png": (MEDIA / "modulo-reclamos.png", "crop"),
    ROOT / "Splash o Portada Movil (1536 x v2048).png": (MEDIA / "splash-mobile.png", "crop"),
}


def fill_corner_mark(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size

    mark_width = max(52, min(width // 12, 96))
    mark_height = max(52, min(height // 8, 96))
    margin_x = max(6, width // 100)
    margin_y = max(6, height // 100)

    x0 = max(0, width - mark_width - margin_x)
    y0 = max(0, height - mark_height - margin_y)
    x1 = width
    y1 = height

    fill = rgba.getpixel((0, 0)) if width > 0 and height > 0 else (255, 255, 255, 0)

    for py in range(y0, y1):
        for px in range(x0, x1):
            rgba.putpixel((px, py), fill)

    return rgba


def crop_corner_mark(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    crop_right = max(34, min(width // 18, 72))
    crop_bottom = max(34, min(height // 12, 72))
    cropped = rgba.crop((0, 0, width - crop_right, height - crop_bottom))
    return cropped.resize((width, height), Image.LANCZOS)


for source, payload in SOURCE_MAP.items():
    target, strategy = payload
    image = Image.open(source)
    cleaned = fill_corner_mark(image) if strategy == "fill" else crop_corner_mark(image)
    cleaned.save(target)

isotipo = Image.open(BRAND / "comunitaria-isotipo.png").convert("RGBA")
for size in (192, 512):
    isotipo.resize((size, size), Image.LANCZOS).save(BRAND / f"icon-{size}.png")

isotipo.resize((180, 180), Image.LANCZOS).save(BRAND / "apple-touch-icon.png")
Image.open(BRAND / "favicon-source.png").convert("RGBA").resize((32, 32), Image.LANCZOS).save(PUBLIC / "favicon.ico")
