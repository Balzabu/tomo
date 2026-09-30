#!/usr/bin/env python3
"""Compose the store / README screenshots from raw device captures.

    python3 scripts/screenshots/compose.py [RAW_DIR] [OUT_DIR] [frame ...]

RAW_DIR (default scripts/screenshots/raw) holds full-resolution captures
(1080x2400, English UI, "Notte" theme, the demo library from demo_library.py,
status bar in demo mode - see README.md here). Writes eight 1080x1920 PNGs to
OUT_DIR (default screenshots/) plus the 1024x500 Play Store feature graphic
and the matching 2048x1000 README banner.
Naming frames (e.g. 03-plan) renders only those.

The set follows current store-listing practice: the first frames sell the
benefit, each frame makes one point with a short headline, the layouts vary
(tilted phone, real UI cards pulled out and enlarged, no-phone collages) and
one continuous background runs across all frames to invite a swipe.

Needs Pillow. The Inter font (SIL Open Font License) is downloaded into
scripts/screenshots/.fonts on first run.
"""
import math
import os
import sys
import urllib.request

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "screenshots")
W, H = 1080, 1920
N = 8  # frames (Google Play's maximum)
SS = 4  # supersampling for anti-aliased curves and rotated edges

FONT_URLS = {  # Google Fonts static TTFs (Inter v20)
    "Inter-Medium.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
    "Inter-Bold.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
    "Inter-Black.ttf": "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg.ttf",
}

INK = (245, 246, 255)
MUTED = (172, 179, 216)
ACCENT = {
    "blue": (122, 162, 247),
    "violet": (187, 154, 247),
    "green": (158, 206, 106),
    "cyan": (125, 207, 255),
    "amber": (224, 175, 104),
    "rose": (247, 118, 142),
}


def font(name, size):
    d = os.path.join(HERE, ".fonts")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    if not os.path.exists(p):
        urllib.request.urlretrieve(FONT_URLS[name], p)
    return ImageFont.truetype(p, size)


def raw(name):
    return Image.open(os.path.join(RAW, name)).convert("RGB")


# ---------------------------------------------------------------- background

def panorama():
    """One wide background for the whole set: a deep gradient, colour glows
    (some straddling two frames) and a light ribbon crossing every frame."""
    pw = W * N
    top, bottom = (27, 31, 54), (11, 13, 25)
    col = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    bg = col.resize((pw, H)).convert("RGBA")

    # Glows are drawn at quarter size, blurred and scaled up (fast and smooth).
    glow = Image.new("RGBA", (pw // 4, H // 4), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    orbs = [  # (x in frames, y, radius, colour, alpha)
        (0.5, 380, 520, "blue", 90), (1.05, 1500, 620, "violet", 70), (1.6, 500, 480, "cyan", 70),
        (2.5, 1350, 600, "green", 60), (3.1, 420, 520, "rose", 70), (3.9, 1450, 620, "blue", 70),
        (4.6, 380, 520, "violet", 80), (5.4, 1400, 600, "amber", 60), (6.2, 460, 520, "violet", 80),
        (7.0, 1500, 600, "cyan", 60), (7.6, 420, 520, "green", 70),
    ]
    for fx, y, r, c, a in orbs:
        cx, cy, rr = fx * W / 4, y / 4, r / 4
        g.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=ACCENT[c] + (a,))
    glow = glow.filter(ImageFilter.GaussianBlur(40)).resize((pw, H), Image.BICUBIC)
    bg = Image.alpha_composite(bg, glow)

    # The ribbon: a slow wave that leaves one frame and enters the next.
    rib = Image.new("RGBA", (pw, H), (0, 0, 0, 0))
    pts = [(x, 1180 + 260 * math.sin(x / 900) + 120 * math.sin(x / 310)) for x in range(-20, pw + 20, 8)]
    ImageDraw.Draw(rib).line(pts, fill=(255, 255, 255, 55), width=12, joint="curve")
    rib = rib.filter(ImageFilter.GaussianBlur(14))
    ImageDraw.Draw(rib).line(pts, fill=(255, 255, 255, 80), width=3, joint="curve")
    return Image.alpha_composite(bg, rib)


# ---------------------------------------------------------------- pieces

def rounded(im, radius):
    """Round the corners, keeping any transparency the image already has
    (replacing it would turn transparent pixels into opaque black)."""
    im = im.convert("RGBA")
    # Drawn at SS x and scaled down: ImageDraw doesn't anti-alias curves.
    m = Image.new("L", (im.width * SS, im.height * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width * SS - 1, im.height * SS - 1], radius=radius * SS, fill=255)
    im.putalpha(ImageChops.multiply(im.getchannel("A"), m.resize(im.size, Image.LANCZOS)))
    return im


def app_icon(size):
    """The launcher icon (a round badge on transparency) with a soft glow."""
    icon = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGBA").resize((size, size), Image.LANCZOS)
    pad = size // 3
    out = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    halo = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([pad, pad, pad + size, pad + size], fill=ACCENT["cyan"] + (90,))
    out.alpha_composite(halo.filter(ImageFilter.GaussianBlur(size // 6)))
    out.alpha_composite(icon, (pad, pad))
    return out, pad


def clean_status_bar(shot):
    """Drop the emulator's leftover icon by the clock and pull the clock and
    the right-hand icons in, clear of the screen's rounded corners."""
    s = shot.copy()
    bar_h = 118
    colour = s.getpixel((540, 60))
    clock = s.crop((0, 0, 90, bar_h))
    right = s.crop((700, 0, 1080, bar_h))
    ImageDraw.Draw(s).rectangle([0, 0, s.width, bar_h - 1], fill=colour)
    s.paste(clock, (46, 0))
    s.paste(right, (660, 0))
    return s


def phone(shot, width):
    """A capture in a slim device frame (RGBA)."""
    bezel = 16
    sw = width - bezel * 2
    sh = round(shot.height * sw / shot.width)
    screen = clean_status_bar(shot).resize((sw, sh), Image.LANCZOS)
    # The frame and camera hole are drawn at SS x for smooth curves.
    bh = sh + bezel * 2
    big = Image.new("RGBA", (width * SS, bh * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.rounded_rectangle([0, 0, width * SS - 1, bh * SS - 1], radius=76 * SS, fill=(12, 13, 20, 255), outline=(62, 68, 98, 255), width=3 * SS)
    body = big.convert("RGBa").resize((width, bh), Image.LANCZOS).convert("RGBA")
    body.alpha_composite(rounded(screen, 62), (bezel, bezel))
    hole = Image.new("RGBA", (22 * SS, 22 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(hole).ellipse([0, 0, 22 * SS - 1, 22 * SS - 1], fill=(5, 5, 8, 255))
    body.alpha_composite(hole.resize((22, 22), Image.LANCZOS), (width // 2 - 11, bezel + 22))
    return body


def _dist(a, b):
    return sum(abs(x - y) for x, y in zip(a[:3], b[:3]))


def card(name, box, tol=16):
    """A real UI card cut out of a capture along its own edges.

    `box` is a crop a little larger than the card(s): whatever surrounds them
    (the page, or the card they sit in) is removed by a flood fill from the
    crop's border, so rounded corners, gaps between tiles and anti-aliased
    edges come out exactly as drawn, with no strip of background around them.
    """
    im = raw(name).crop(box)
    bg = im.getpixel((2, 2))
    marked = im.copy()
    magic = (255, 0, 255)
    w, h = im.size
    for x, y in [(x, 0) for x in range(0, w, 6)] + [(x, h - 1) for x in range(0, w, 6)] + \
                [(0, y) for y in range(0, h, 6)] + [(w - 1, y) for y in range(0, h, 6)]:
        p = marked.getpixel((x, y))
        if p != magic and _dist(p, bg) <= tol:
            ImageDraw.floodfill(marked, (x, y), magic, thresh=tol)
    px, mk = im.load(), marked.load()
    alpha = Image.new("L", im.size, 255)
    al = alpha.load()
    # The card's own colour, to grade the anti-aliased rim against.
    inner = im.getpixel((w // 2, min(h - 1, 40)))
    span = max(1, _dist(inner, bg))
    for y in range(h):
        for x in range(w):
            if mk[x, y] == magic:
                al[x, y] = 0
            elif (x and mk[x - 1, y] == magic) or (x < w - 1 and mk[x + 1, y] == magic) or \
                    (y and mk[x, y - 1] == magic) or (y < h - 1 and mk[x, y + 1] == magic):
                a = max(0, min(255, round(255 * _dist(px[x, y], bg) / span * 1.4)))
                al[x, y] = a
                if 0 < a < 255:
                    # An anti-aliased edge pixel is card blended with the old
                    # background: take the background out, or the edge keeps
                    # a dark fringe on any new background.
                    f = a / 255
                    px[x, y] = tuple(max(0, min(255, round((c - (1 - f) * b) / f))) for c, b in zip(px[x, y], bg))
    # Keep only what is joined to the middle of the crop: a sliver of a
    # neighbouring card caught by the box must not come along.
    keep = alpha.point(lambda v: 255 if v else 0)
    seed = (w // 2, h // 2)
    if keep.getpixel(seed):
        ImageDraw.floodfill(keep, seed, 128)
        keep = keep.point(lambda v: 255 if v == 128 else 0)
        alpha = Image.composite(alpha, Image.new("L", im.size, 0), keep.filter(ImageFilter.MaxFilter(3)))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(alpha.getbbox())


def widget(name, box, radius):
    """A home-screen widget: its surround is the wallpaper, not a flat colour,
    so it is cut with a rounded mask of the widget's own radius (drawn at 4x
    for smooth corners), a pixel inside its edge."""
    im = raw(name).crop(box).convert("RGBA")
    k = 4
    m = Image.new("L", (im.width * k, im.height * k), 0)
    ImageDraw.Draw(m).rounded_rectangle([k, k, im.width * k - 1 - k, im.height * k - 1 - k], radius=radius * k, fill=255)
    im.putalpha(m.resize(im.size, Image.LANCZOS))
    return im


def _composite_clipped(canvas, piece, x, y):
    """alpha_composite that tolerates pieces running off the canvas."""
    left, top = max(0, -x), max(0, -y)
    right, bottom = min(piece.width, canvas.width - x), min(piece.height, canvas.height - y)
    if right > left and bottom > top:
        canvas.alpha_composite(piece.crop((left, top, right, bottom)), (x + left, y + top))


def place(canvas, piece, cx, cy, scale=1.0, angle=0.0):
    """Paste a piece centred at (cx, cy), scaled and rotated, over a soft drop
    shadow so it floats above the background.

    Rotation works at SS x the final size and is then scaled down, with
    premultiplied alpha ("RGBa"): a plain rotate leaves stair-stepped,
    un-antialiased edges and dark fringes where transparent pixels bleed."""
    tw, th = round(piece.width * scale), round(piece.height * scale)
    if angle:
        big = piece.convert("RGBa").resize((tw * SS, th * SS), Image.LANCZOS)
        big = big.rotate(angle, resample=Image.BICUBIC, expand=True)
        piece = big.resize((round(big.width / SS), round(big.height / SS)), Image.LANCZOS).convert("RGBA")
    elif scale != 1.0:
        piece = piece.convert("RGBa").resize((tw, th), Image.LANCZOS).convert("RGBA")
    x, y = round(cx - piece.width / 2), round(cy - piece.height / 2)
    pad = 80
    sh = Image.new("RGBA", (piece.width + pad * 2, piece.height + pad * 2), (0, 0, 0, 0))
    alpha = Image.new("L", sh.size, 0)
    alpha.paste(piece.getchannel("A").point(lambda v: v * 0.62), (pad, pad))
    sh.putalpha(alpha.filter(ImageFilter.GaussianBlur(30)))
    _composite_clipped(canvas, sh, x - pad, y - pad + 28)
    _composite_clipped(canvas, piece, x, y)


def headline(canvas, text, sub=None, y=150, accent="blue", kicker=None, size=94):
    d = ImageDraw.Draw(canvas)
    if kicker:
        kf = font("Inter-Bold.ttf", 28)
        light = tuple(round(c + (255 - c) * 0.35) for c in ACCENT[accent])
        tw = sum(d.textlength(ch, font=kf) + 5 for ch in kicker) - 5
        x = (W - tw) / 2
        for ch in kicker:
            d.text((x, y), ch, font=kf, fill=light)
            x += d.textlength(ch, font=kf) + 5
        y += 64
    tf = font("Inter-Black.ttf", size)
    for line in text.split("\n"):
        d.text(((W - d.textlength(line, font=tf)) / 2, y), line, font=tf, fill=INK)
        y += round(size * 1.08)
    if sub:
        sf = font("Inter-Medium.ttf", 36)
        y += 22
        for line in sub.split("\n"):
            d.text(((W - d.textlength(line, font=sf)) / 2, y), line, font=sf, fill=MUTED)
            y += 50
    return y


# ---------------------------------------------------------------- frames

def f_hero(c):
    d = ImageDraw.Draw(c)
    icon, pad = app_icon(120)
    wf = font("Inter-Black.ttf", 52)
    tw = 120 + 22 + d.textlength("Tomo", font=wf)
    x0 = (W - tw) / 2
    c.alpha_composite(icon, (round(x0) - pad, 118 - pad))
    d.text((x0 + 142, 146), "Tomo", font=wf, fill=INK)
    y = headline(c, "Your reading life,\nbeautifully tracked.", "Free. No ads. No account.", y=292, size=86)
    place(c, phone(raw("01-library.png"), 700), 560, y + 860, angle=-6)
    place(c, card("04b-stats-top.png", (32, 614, 368, 934)), 905, y + 430, scale=1.05, angle=6)
    place(c, card("04b-stats-top.png", (32, 262, 368, 613)), 170, y + 1030, angle=-7)


def f_stats(c):
    y = headline(c, "Watch your habit\ngrow every day.", "Streaks, a reading calendar and your pace.", accent="cyan", kicker="STATISTICS")
    place(c, card("04b-stats-top.png", (30, 262, 1050, 935)), 540, y + 400, scale=0.88, angle=-2)
    place(c, card("04-stats.png", (30, 955, 1050, 1615)), 545, y + 1050, scale=0.97, angle=2)


def f_plan(c):
    y = headline(c, "Finish books\non time.", "Pick a date. Get a daily page quota.", accent="green", kicker="READING PLANS")
    place(c, phone(raw("02-book.png"), 700), 440, y + 860, angle=-4)
    place(c, card("02-book.png", (70, 2070, 1010, 2366)), 560, y + 1060, scale=1.02, angle=3)


def f_quotes(c):
    y = headline(c, "Keep the lines\nyou love.", "Save quotes as you read. Share them in style.", accent="rose", kicker="NOTES & QUOTES")
    place(c, phone(raw("06b-quotes-list.png"), 640), 720, y + 860, angle=7)
    place(c, card("06-quotes.png", (132, 1318, 948, 2136)), 420, y + 760, scale=1.1, angle=-6)


def f_widgets(c):
    y = headline(c, "Your books on\nyour home screen.", "Your current read and a quote every day.", accent="blue", kicker="WIDGETS")
    place(c, widget("07-widgets.png", (49, 384, 1029, 933), 62), 540, y + 440, scale=0.9, angle=-3)
    place(c, widget("07-widgets.png", (49, 967, 1029, 1516), 62), 540, y + 1040, scale=0.9, angle=3)


def f_goals(c):
    y = headline(c, "Hit every\nreading goal.", "Daily, monthly, yearly - and challenges.", accent="amber", kicker="GOALS")
    place(c, card("05-goals.png", (30, 240, 1050, 758)), 500, y + 330, scale=0.9, angle=-3)
    place(c, card("05-goals.png", (30, 902, 1050, 1420)), 580, y + 820, scale=0.9, angle=2.5)
    place(c, card("05-goals.png", (30, 1564, 1050, 2082)), 510, y + 1310, scale=0.9, angle=-2)


def f_year(c):
    y = headline(c, "Your year,\nin one card.", "Pages, hours and every cover you loved.", accent="violet", kicker="YEAR IN BOOKS")
    place(c, card("08-wrapped.png", (106, 712, 974, 2232)), 540, y + 800, scale=0.98, angle=-4)


def f_private(c):
    y = headline(c, "Free. Private.\nYours.", None, accent="green", kicker="NO STRINGS ATTACHED")
    d = ImageDraw.Draw(c)
    items = [
        "No ads, ever",
        "No account, no tracking",
        "Your data stays on your phone",
        "PIN & fingerprint lock",
        "Import from Goodreads, StoryGraph,\nBookmory and Openreads",
        "Open source",
    ]
    f = font("Inter-Bold.ttf", 40)
    x, yy = 150, y + 80
    for it in items:
        d.ellipse([x, yy + 4, x + 52, yy + 56], fill=ACCENT["green"])
        d.line([(x + 14, yy + 31), (x + 23, yy + 41), (x + 40, yy + 19)], fill=(20, 24, 36), width=7, joint="curve")
        lines = it.split("\n")
        for k, line in enumerate(lines):
            d.text((x + 80, yy + k * 52), line, font=f, fill=INK)
        yy += 52 * len(lines) + 30
    place(c, phone(raw("09-lock.png"), 520), 540, yy + 640)


FRAMES = [
    ("01-hero", f_hero),
    ("02-stats", f_stats),
    ("03-plan", f_plan),
    ("04-quotes", f_quotes),
    ("05-widgets", f_widgets),
    ("06-goals", f_goals),
    ("07-year", f_year),
    ("08-private", f_private),
]


def feature_graphic():
    """Play Store feature graphic, 1024x500: drawn at 2x and scaled down.
    Headline on the left, the app on the right; everything important stays
    clear of the edges (Play crops it in some placements)."""
    k = 2
    fw, fh = 1024 * k, 500 * k
    # Background: the same deep gradient and glows as the screenshots.
    col = Image.new("RGB", (1, fh))
    for y in range(fh):
        t = y / (fh - 1)
        col.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip((30, 34, 60), (11, 13, 25))))
    img = col.resize((fw, fh)).convert("RGBA")
    glow = Image.new("RGBA", (fw // 4, fh // 4), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for cx, cy, r, c, a in [(0.18, 0.2, 360, "blue", 90), (0.62, 0.9, 420, "violet", 90), (0.95, 0.15, 360, "cyan", 70)]:
        x, y, rr = cx * fw / 4, cy * fh / 4, r / 4
        g.ellipse([x - rr, y - rr, x + rr, y + rr], fill=ACCENT[c] + (a,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(30)).resize((fw, fh), Image.BICUBIC))
    rib = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    pts = [(x, 700 + 170 * math.sin(x / 520) + 60 * math.sin(x / 190)) for x in range(-20, fw + 20, 6)]
    ImageDraw.Draw(rib).line(pts, fill=(255, 255, 255, 50), width=10, joint="curve")
    rib = rib.filter(ImageFilter.GaussianBlur(10))
    ImageDraw.Draw(rib).line(pts, fill=(255, 255, 255, 75), width=3, joint="curve")
    img = Image.alpha_composite(img, rib)

    # Right: the phone, tilted and running off the bottom, with two cards.
    place(img, phone(raw("01-library.png"), 560), 1560, 930, angle=-8)
    place(img, card("04b-stats-top.png", (32, 614, 368, 934)), 1810, 400, scale=0.82, angle=7)
    place(img, card("04b-stats-top.png", (32, 262, 368, 613)), 1180, 830, scale=0.74, angle=-6)

    # Left: brand and headline.
    d = ImageDraw.Draw(img)
    x0 = 130
    icon, pad = app_icon(120)
    img.alpha_composite(icon, (x0 - pad, 150 - pad))
    d.text((x0 + 146, 170), "Tomo", font=font("Inter-Black.ttf", 72), fill=INK)
    tf = font("Inter-Black.ttf", 104)
    y = 340
    for line in ("Your reading life,", "beautifully tracked."):
        d.text((x0, y), line, font=tf, fill=INK)
        y += 118
    sf = font("Inter-Bold.ttf", 44)
    y += 34
    xx = x0
    for i, part in enumerate(["Free", "No ads", "No account"]):
        if i:
            d.ellipse([xx + 14, y + 22, xx + 26, y + 34], fill=ACCENT["green"])
            xx += 40
        d.text((xx, y), part, font=sf, fill=MUTED)
        xx += d.textlength(part, font=sf)
    # The same picture is the README banner (2048x1000 is exactly the 2x render).
    img.convert("RGB").save(os.path.join(OUT, "banner.png"), optimize=True)
    img.convert("RGB").resize((1024, 500), Image.LANCZOS).save(os.path.join(OUT, "play-feature-graphic.png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    pano = panorama()
    only = set(sys.argv[3:])
    if only == {"feature"}:
        feature_graphic()
        print("wrote play-feature-graphic")
        return
    for i, (name, fn) in enumerate(FRAMES):
        if only and name not in only:
            continue
        frame = pano.crop((i * W, 0, (i + 1) * W, H))
        fn(frame)
        frame.convert("RGB").save(os.path.join(OUT, name + ".png"), optimize=True)
        print("wrote", name)
    feature_graphic()


if __name__ == "__main__":
    main()
