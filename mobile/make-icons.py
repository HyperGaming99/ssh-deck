#!/usr/bin/env python3
"""Erzeugt die Android-Icons (Launcher, adaptiv, Splash) aus assets/logo-1024.png und assets/icon-1024.png.
python3 mobile/make-icons.py"""
import glob, os
from PIL import Image, ImageDraw

root = os.path.join(os.path.dirname(__file__), '..')
res = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
logo = Image.open(os.path.join(root, 'assets', 'logo-1024.png')).convert('RGBA')   # Kartenstapel, transparent
tile = Image.open(os.path.join(root, 'assets', 'icon-1024.png')).convert('RGBA')   # fertige Kachel
BG = (15, 17, 36, 255)  # wie die dunkle Fläche hinter dem Logo
glyph = logo.crop(logo.getbbox())

def place(canvas_px, frac):
    """Logo mittig auf transparenter Fläche, Kantenlänge = frac der Fläche."""
    g = glyph.copy(); g.thumbnail((int(canvas_px * frac),) * 2, Image.LANCZOS)
    c = Image.new('RGBA', (canvas_px, canvas_px), (0, 0, 0, 0))
    c.paste(g, ((canvas_px - g.width) // 2, (canvas_px - g.height) // 2), g)
    return c

# adaptiv: 108dp-Fläche, sichtbar ist der mittlere Kreis (66 %), das Logo bleibt darin
for d, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    place(px, 0.56).save(os.path.join(res, f'mipmap-{d}', 'ic_launcher_foreground.png'))
# alte Launcher (vor Android 8): Kachel bzw. runde Kachel
for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    t = tile.resize((px, px), Image.LANCZOS); t.save(os.path.join(res, f'mipmap-{d}', 'ic_launcher.png'))
    big = Image.new('RGBA', (px * 4, px * 4), BG); big.paste(place(px * 4, 0.62), (0, 0), place(px * 4, 0.62))
    m = Image.new('L', big.size, 0); ImageDraw.Draw(m).ellipse((0, 0) + big.size, fill=255)
    r = Image.new('RGBA', big.size, (0, 0, 0, 0)); r.paste(big, (0, 0), m)
    r.resize((px, px), Image.LANCZOS).save(os.path.join(res, f'mipmap-{d}', 'ic_launcher_round.png'))
# Splash: dunkel mit Logo, in den vorhandenen Größen
for f in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):
    w, h = Image.open(f).size
    s = Image.new('RGBA', (w, h), BG); g = place(min(w, h), 0.34); s.paste(g, ((w - g.width) // 2, (h - g.height) // 2), g)
    s.convert('RGB').save(f)
