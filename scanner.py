#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Improved German receipt scanner (batch mode, CLI, robust handling).
Key features:
 - CLI: input file or directory, choose model-tier (mobile/server)
 - Lazy OCR initialization (singleton) to avoid repeated expensive loads
 - Confidence filtering, token deduplication, robust PaddleOCR return handling
 - Better VAT token normalization and explicit visual mapping
 - Debug image with annotated name (green) / price (red) boxes + labels
 - Output: JSON per image with items + 'text' blob + metadata
"""

from __future__ import annotations
import argparse
import json
import logging
import re
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

import numpy as np
from paddleocr import PaddleOCR
from PIL import Image, ImageDraw, ImageFont

# ---------------- Logging ----------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("receipt-scanner")

# --------- Patterns & Heuristics (mostly preserved) ---------
PRICE_CORE = r'(?:\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})'
PRICE_RE = re.compile(
    rf'(?xi)'
    rf'(?<!\d)\s*'
    rf'(?:€|\bEUR\b)?\s*'
    rf'({PRICE_CORE})'
    rf'\s*(?:€|\bEUR\b)?'
    rf'(?:\s*[ABC])?'
)
PRICE_WITH_VAT_RE = re.compile(
    rf'(?xi)'
    rf'(?<!\d)\s*(?:€|\bEUR\b)?\s*'
    rf'({PRICE_CORE})\s*(?:€|\bEUR\b)?\s*([ABC])\b'
)
VAT_TAG_TOKEN_RE = re.compile(r'^[ABC]$')

BAD_NAME_KEYWORDS_RE = re.compile(
    r'(?i)\b('
    r'summe|zwischensumme|gesamt|total|zu\s*zahlen|rundung|rabatt|pfand|'
    r'ec[-\s]*cash|kundenbeleg|kassenbon|kassenbeleg|uid|steuern?|mwst|ust|'
    r'eur$'
    r')\b'
)

QTY_ONLY_RE = re.compile(r'(?i)^\s*\d+\s*(stk|stück|x)\b')
UNIT_PRICE_RE = re.compile(
    r'(?xi)'
    r'(?:'
    r'€\s*/\s*(kg|g|100g|l|ml|stk|stück)|'
    r'(pro|per)\s*(kg|g|100g|l|ml|stk|stück)|'
    r'/(kg|g|100g|l|ml)'
    r')'
)
IGNORE_NAME_TOKENS_RE = re.compile(r'^(?:€|EUR|[ABC]|[①②③④⑤⑥⑦⑧⑨])$')

# --------- Geometry helpers ---------
def poly_to_bbox(poly: List[List[float]]) -> Tuple[float, float, float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))

def vertical_overlap_ratio(a: Tuple[float, float, float, float],
                           b: Tuple[float, float, float, float]) -> float:
    _, ay1, _, ay2 = a
    _, by1, _, by2 = b
    inter = max(0.0, min(ay2, by2) - max(ay1, by1))
    union = (ay2 - ay1) + (by2 - by1) - inter
    return inter / union if union > 0 else 0.0

# --------- Price parsing ---------
def parse_price_value(raw: str) -> Tuple[Optional[float], str]:
    cur = "EUR"
    s = raw.strip()
    # Heuristic: if comma is used as decimal and appears after last dot, treat comma as decimal
    last_comma = s.rfind(',')
    last_dot = s.rfind('.')
    if last_comma > last_dot:
        s = s.replace('.', '').replace(',', '.')
    else:
        # remove thousands commas/dots when decimal absent
        # replace commas if they are thousands separators
        if ',' in s and re.search(r'\d{1,3}\,\d{3}', s):
            s = s.replace(',', '')
        else:
            s = s.replace(',', '.')
    nums = re.findall(r'[-+]?\d*\.?\d+|\d+', s)
    if not nums:
        return None, cur
    try:
        return float(nums[0]), cur
    except Exception:
        return None, cur

# ---------------- Token extraction ----------------
def extract_tokens_from_resjson(d: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Support different PaddleOCR result variants that may contain:
    - 'rec_texts', 'rec_scores', 'rec_polys'
    - 'texts', 'scores', 'polys'
    - Or nested dicts (server variant)
    """
    def find_first(keys: List[str]):
        for k in keys:
            if k in d and isinstance(d[k], list):
                return d[k]
        for v in d.values():
            if isinstance(v, dict):
                for k in keys:
                    if k in v and isinstance(v[k], list):
                        return v[k]
        return None

    texts = find_first(["rec_texts", "texts"])
    scores = find_first(["rec_scores", "scores"])
    polys = find_first(["rec_polys", "polys", "dt_polys"])
    if not texts or not polys:
        return []

    n = min(len(texts), len(polys), len(scores) if scores else 10**9)
    out = []
    for i in range(n):
        t = texts[i]
        s = float(scores[i]) if scores and i < len(scores) else None
        poly = polys[i]
        if isinstance(poly, np.ndarray):
            poly = poly.tolist()
        if not isinstance(poly, list) or len(poly) < 4:
            continue
        x1, y1, x2, y2 = poly_to_bbox(poly)
        out.append({"text": t, "score": s, "box": [x1, y1, x2, y2]})
    return out

def extract_tokens_from_generic(result: Any) -> List[Dict[str, Any]]:
    """
    Fallback: many PaddleOCR versions return a list-of-lists like:
      [ [poly, (text, score)], ... ]
    or already structured dicts.
    """
    out = []
    if isinstance(result, dict):
        out.extend(extract_tokens_from_resjson(result))
    elif isinstance(result, (list, tuple)):
        for entry in result:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                poly, txt_score = entry
                # poly sometimes array
                if isinstance(poly, np.ndarray):
                    poly = poly.tolist()
                # txt_score could be (text, score) or [text, score]
                if isinstance(txt_score, (list, tuple)) and len(txt_score) >= 1:
                    text = txt_score[0]
                    score = float(txt_score[1]) if len(txt_score) > 1 else None
                    try:
                        x1, y1, x2, y2 = poly_to_bbox(poly)
                        out.append({"text": text, "score": score, "box": [x1, y1, x2, y2]})
                    except Exception:
                        continue
    return out

# ----------------- Group rows -----------------
def group_rows(tokens: List[Dict[str, Any]], overlap_thresh: float = 0.45) -> List[List[Dict[str, Any]]]:
    tokens = sorted(tokens, key=lambda a: (a["box"][1], a["box"][0]))
    rows: List[List[Dict[str, Any]]] = []
    for tok in tokens:
        placed = False
        for row in rows:
            row_boxes = [t["box"] for t in row]
            x1 = min(b[0] for b in row_boxes)
            y1 = min(b[1] for b in row_boxes)
            x2 = max(b[2] for b in row_boxes)
            y2 = max(b[3] for b in row_boxes)
            if vertical_overlap_ratio(tok["box"], (x1, y1, x2, y2)) >= overlap_thresh:
                row.append(tok)
                placed = True
                break
        if not placed:
            rows.append([tok])
    for r in rows:
        r.sort(key=lambda a: a["box"][0])
    return rows

# ----------------- VAT normalization (improved/cleaned) -----------------
_VISUAL_MAP = {
    # Greek/Cyrillic -> Latin lookalikes
    'Β': 'B', 'В': 'B', 'А': 'A', 'Α': 'A', 'С': 'C', 'Ϲ': 'C',
    # currency/symbols that look like B
    '฿': 'B', 'Ƀ': 'B',
    # digits commonly misread for letters
    '8': 'B', '3': 'B', 'ß': 'B',
    '0': 'O', '1': 'I', 'l': 'I',
    # lower-case variants
    'ß': 'B', 'α': 'A', 'с': 'C',
}

def _map_char_to_abc(ch: str) -> Optional[str]:
    up = ch.upper()
    if up in ('A', 'B', 'C'):
        return up
    if ch in _VISUAL_MAP:
        return _VISUAL_MAP[ch]
    # Unicode name heuristics (best-effort, avoid failing)
    try:
        name = unicodedata.name(ch)
        if 'GREEK' in name and 'BETA' in name:
            return 'B'
        if 'CYRILLIC' in name:
            # common CYRILLIC VE looks like B
            if 'VE' in name or 'VE' in name.upper():
                return 'B'
            if 'A' in name:
                return 'A'
    except Exception:
        pass
    return None

def _normalize_vat_token(txt: str) -> Optional[str]:
    if not txt:
        return None
    s = str(txt).strip()
    if not s:
        return None
    # Decompose and remove combining marks
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if unicodedata.category(ch)[0] != 'M')
    # Keep alnum plus Greek/Cyrillic blocks; remove punctuation
    s_alnum = re.sub(r'[^0-9A-Za-z\u0370-\u03FF\u0400-\u04FF]', '', s)
    if not s_alnum:
        # If token was non-digit glyph or small unreadable, map to 'B' as fallback
        if any(not ch.isdigit() for ch in s):
            return 'B'
        return None
    mapped = []
    for ch in s_alnum:
        m = _map_char_to_abc(ch)
        if m:
            mapped.append(m)
    if mapped:
        # prefer the first recognized A/B/C
        for c in mapped:
            if c in ('A', 'B', 'C'):
                return c
    # length-1 non-digit fallback
    if len(s_alnum) == 1 and not s_alnum.isdigit():
        return 'B'
    # ascii fallback: strip digits and take first letter, if it's reasonable
    letters = re.sub(r'[\d]', '', s_alnum)
    if letters:
        candidate = letters[0].upper()
        if candidate in ('A', 'B', 'C'):
            return candidate
        if len(letters) <= 2:
            # permissive fallback per original instruction
            return 'B'
    return None

def _has_inline_vat_tag(text: str) -> Optional[str]:
    m = PRICE_WITH_VAT_RE.search(text or "")
    if m:
        return m.group(2).upper()
    return _normalize_vat_token(text or "")

def _nearby_vat_tag_for_price_rows(price_tok: Dict[str, Any],
                                   rows: List[List[Dict[str, Any]]],
                                   ridx: int,
                                   search_above_rows: int = 3,
                                   search_below_rows: int = 1) -> Optional[str]:
    px1, py1, px2, py2 = price_tok["box"]
    p_h = max(1.0, py2 - py1)
    row = rows[ridx]
    # same row first: tokens sorted by proximity to price center
    neighbors = [t for t in row if t is not price_tok]
    neighbors.sort(key=lambda t: abs(((t["box"][0] + t["box"][2]) / 2.0) - ((px1 + px2) / 2.0)))
    for t in neighbors:
        vat = _normalize_vat_token((t.get("text") or ""))
        if vat:
            vx1, vy1, vx2, vy2 = t["box"]
            if (vx1 <= px2 + 40) and vertical_overlap_ratio(price_tok["box"], t["box"]) >= 0.15:
                return vat
    # below rows
    for d in range(1, search_below_rows + 1):
        rr = ridx + d
        if rr >= len(rows): break
        for t in rows[rr]:
            vat = _normalize_vat_token((t.get("text") or ""))
            if vat:
                vx1, vy1, vx2, vy2 = t["box"]
                cx = (vx1 + vx2) / 2.0
                if (px1 - 40) <= cx <= (px2 + 40) and 0 <= vy1 - py2 <= max(8.0, 1.5 * p_h):
                    return vat
    # above rows
    for u in range(1, search_above_rows + 1):
        idx = ridx - u
        if idx < 0:
            break
        for t in rows[idx]:
            vat = _normalize_vat_token((t.get("text") or ""))
            if vat:
                vx1, vy1, vx2, vy2 = t["box"]
                cx = (vx1 + vx2) / 2.0
                if (px1 - 50) <= cx <= (px2 + 50) and 0 <= (py1 - vy2) <= max(12.0, 1.8 * p_h * u):
                    return vat
    return None

# ----------------- Name helpers (kept) -----------------
def _is_unit_price_context(row: List[Dict[str, Any]]) -> bool:
    txt = " ".join((t.get("text") or "") for t in row)
    return bool(UNIT_PRICE_RE.search(txt))

def _is_bad_name(name: str) -> bool:
    n = name.strip()
    if not n:
        return True
    if n.upper() in {"EUR", "€"}:
        return True
    if BAD_NAME_KEYWORDS_RE.search(n):
        return True
    return False

def _build_name_from_left_tokens(tokens: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for t in tokens:
        txt = (t.get("text") or "").strip()
        if not txt:
            continue
        if IGNORE_NAME_TOKENS_RE.fullmatch(txt):
            continue
        parts.append(txt)
    return " ".join(parts).strip()

def _find_name_tokens_for_price(pt: Dict[str, Any], rows: List[List[Dict[str, Any]]], ridx: int) -> List[Dict[str, Any]]:
    px1, py1, px2, py2 = pt["box"]
    row = rows[ridx]
    left_same_row = [
        t for t in row
        if t is not pt and t["box"][2] <= px1 - 2 and not PRICE_RE.search(t.get("text") or "") and not UNIT_PRICE_RE.search(t.get("text") or "")
    ]
    if left_same_row:
        return left_same_row
    px_center = (px1 + px2) / 2.0
    for i in range(1, 4):
        if ridx - i < 0:
            break
        prev = rows[ridx - i]
        cand = [
            t for t in prev
            if not PRICE_RE.search(t.get("text") or "") and not UNIT_PRICE_RE.search(t.get("text") or "")
        ]
        cand = [t for t in cand if ((t["box"][0] + t["box"][2]) / 2.0) < (px_center + 35)]
        if cand:
            return cand
    if ridx - 1 >= 0:
        prev = rows[ridx - 1]
        cand = [
            t for t in prev
            if not PRICE_RE.search(t.get("text") or "") and vertical_overlap_ratio(t["box"], pt["box"]) >= 0.05
        ]
        if cand:
            return cand
    return []

# ----------------- Item building -----------------
def build_items_from_rows(rows: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for ridx, row in enumerate(rows):
        row_has_unit_ctx = _is_unit_price_context(row)
        price_tokens = [t for t in row if PRICE_RE.search(t.get("text") or "")]
        for pt in price_tokens:
            raw_text = pt.get("text") or ""
            vat = _has_inline_vat_tag(raw_text)
            if not vat:
                vat = _nearby_vat_tag_for_price_rows(pt, rows, ridx)
            if not vat:
                continue
            if row_has_unit_ctx or UNIT_PRICE_RE.search(raw_text):
                continue
            name_tokens = _find_name_tokens_for_price(pt, rows, ridx)
            if not name_tokens:
                continue
            name = _build_name_from_left_tokens(name_tokens)
            if _is_bad_name(name):
                continue
            if QTY_ONLY_RE.match(name) and len(name.split()) <= 3:
                continue
            m = PRICE_RE.search(raw_text)
            if not m:
                continue
            raw_price = m.group(0)
            value, currency = parse_price_value(raw_price)
            if value is None:
                continue
            nx1 = min(t["box"][0] for t in name_tokens)
            ny1 = min(t["box"][1] for t in name_tokens)
            nx2 = max(t["box"][2] for t in name_tokens)
            ny2 = max(t["box"][3] for t in name_tokens)
            px1, py1, px2, py2 = pt["box"]
            items.append({
                "rowIndex": ridx,
                "name": name,
                "nameBox": [nx1, ny1, nx2, ny2],
                "price": {
                    "raw": raw_price,
                    "value": value,
                    "currency": "EUR",
                    "vatTag": vat
                },
                "priceBox": [px1, py1, px2, py2],
                "confidence": pt.get("score"),
            })
    return items

# ----------------- PIL debug drawing -----------------
def _find_font():
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ]
    for p in candidates:
        if Path(p).is_file():
            return str(p)
    return None

def save_debug_image(image_path: Path, all_tokens: List[Dict[str, Any]], items: List[Dict[str, Any]], out_path: Path):
    try:
        img = Image.open(str(image_path)).convert("RGB")
    except Exception as e:
        logger.warning("Failed to open image for debug drawing: %s", e)
        return
    draw = ImageDraw.Draw(img)
    font_path = _find_font()
    font = None
    try:
        if font_path:
            font = ImageFont.truetype(font_path, size=12)
    except Exception:
        font = None
    # draw all tokens lightly
    for t in all_tokens:
        x1, y1, x2, y2 = t["box"]
        draw.rectangle([x1, y1, x2, y2], outline=(200, 200, 200), width=1)
    # draw items: name (green) and price (red)
    for idx, it in enumerate(items):
        nx1, ny1, nx2, ny2 = it["nameBox"]
        px1, py1, px2, py2 = it["priceBox"]
        draw.rectangle([nx1, ny1, nx2, ny2], outline=(0, 200, 0), width=3)
        draw.rectangle([px1, py1, px2, py2], outline=(200, 0, 0), width=3)
        label = f"{it['price']['value']:.2f} {it['price']['currency']} ({it['price']['vatTag']})"
        try:
            draw.text((nx1, max(0, ny1 - 12)), f"{idx+1}. {it['name']}", fill=(0, 200, 0), font=font)
            draw.text((px1, max(0, py1 - 12)), label, fill=(200, 0, 0), font=font)
        except Exception:
            draw.text((nx1, max(0, ny1 - 12)), f"{idx+1}. {it['name']}", fill=(0, 200, 0))
            draw.text((px1, max(0, py1 - 12)), label, fill=(200, 0, 0))
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(out_path), quality=90)
        logger.info("Saved debug image to: %s", out_path.resolve())
    except Exception as e:
        logger.warning("Failed to save debug image: %s", e)

# ----------------- OCR Singleton -----------------
class OCRWrapper:
    _instance: Optional[PaddleOCR] = None

    @classmethod
    def get(cls, model_tier: str = "mobile",
            use_doc_orientation_classify: bool = True, use_doc_unwarping: bool = True) -> PaddleOCR:
        if cls._instance is None:
            logger.info("Initializing PaddleOCR (tier=%s)...", model_tier)
            # model names maintained as in user's original script but allow 'server' choice
            if model_tier == "server":
                det_name = "PP-OCRv5_det"  # prefer non-mobile detection; user can change explicitly
                rec_name = "PP-OCRv5_rec"
            else:
                det_name = "PP-OCRv5_mobile_det"
                rec_name = "PP-OCRv5_mobile_rec"
            cls._instance = PaddleOCR(
                lang="de",
                text_detection_model_name=det_name,
                text_recognition_model_name=rec_name,
                use_doc_orientation_classify=use_doc_orientation_classify,
                use_doc_unwarping=use_doc_unwarping,
                use_textline_orientation=True,

                
            )
        return cls._instance

# ----------------- Process single image -----------------
def process_image(image_path: Path, ocr: PaddleOCR, min_confidence: float = 0.0, save_debug: bool = True, out_dir: Path = Path("output")) -> Path:
    logger.info("Processing: %s", image_path)
    results = ocr.predict(str(image_path))
    if not results:
        logger.info("No OCR results for %s", image_path)
        out_path = out_dir / f"{image_path.stem}_items.json"
        out_dir.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"items": [], "itemCount": 0, "text": ""}, f, ensure_ascii=False, indent=2)
        return out_path

    # collect tokens robustly
    all_tokens: List[Dict[str, Any]] = []
    all_texts: List[str] = []
    for res in results:
        if isinstance(res, dict):
            toks = extract_tokens_from_resjson(res)
            all_tokens.extend(toks)
            all_texts.extend([t["text"] for t in toks if t.get("text")])
        else:
            toks = extract_tokens_from_generic(res)
            all_tokens.extend(toks)
            all_texts.extend([t["text"] for t in toks if t.get("text")])

    # filter by confidence if provided (None scores kept)
    if min_confidence and min_confidence > 0.0:
        before = len(all_tokens)
        all_tokens = [t for t in all_tokens if (t.get("score") is None or t.get("score") >= min_confidence)]
        logger.debug("Filtered tokens by confidence: %d -> %d", before, len(all_tokens))

    # dedupe tokens that are almost identical and overlapping (simple heuristic)
    deduped: List[Dict[str, Any]] = []
    for t in all_tokens:
        skip = False
        for u in deduped:
            # if boxes overlap heavily and text equal or contained, skip
            if vertical_overlap_ratio(tuple(t["box"]), tuple(u["box"])) > 0.6:
                if (t["text"] or "").strip() == (u["text"] or "").strip():
                    skip = True
                    break
                # if one text contained in other and lengths differ drastically, prefer longer
                if (t["text"] or "").strip() in (u["text"] or "") and len((u["text"] or "")) > len((t["text"] or "")):
                    skip = True
                    break
        if not skip:
            deduped.append(t)
    all_tokens = deduped

    rows = group_rows(all_tokens)
    items = build_items_from_rows(rows)

    out_dir.mkdir(parents=True, exist_ok=True)
    items_path = out_dir / f"{image_path.stem}_items.json"
    payload = {
        "items": items,
        "itemCount": len(items),
        "text": "\n".join(all_texts),
        "meta": {
            "source": str(image_path),
            "tokenCount": len(all_tokens),
        }
    }
    with open(items_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    logger.info("Saved items JSON to: %s", items_path.resolve())
    if save_debug:
        debug_img_path = out_dir / f"{image_path.stem}_result.jpg"
        save_debug_image(image_path, all_tokens, items, debug_img_path)
    return items_path

# ----------------- CLI / Main -----------------
def main():
    parser = argparse.ArgumentParser(description="German receipt scanner (PaddleOCR + heuristics)")
    parser.add_argument("path", type=str, help="Image file or directory to process")
    parser.add_argument("--model-tier", choices=("mobile", "server"), default="mobile",
                        help="Which model family to use (mobile=fast, server=higher-accuracy)")
    parser.add_argument("--min-conf", type=float, default=0.0, help="Minimum token confidence (0.0 disables)")
    parser.add_argument("--out", type=str, default="output", help="Output directory")
    parser.add_argument("--no-debug-image", dest="debug_image", action="store_false",
                        help="Do not emit debug image")
    parser.add_argument("--recursive", action="store_true", help="If input is dir, search recursively")
    args = parser.parse_args()

    p = Path(args.path)
    out_dir = Path(args.out)
    ocr = OCRWrapper.get(model_tier=args.model_tier)

    targets: List[Path] = []
    if p.is_dir():
        if args.recursive:
            for ext in ("*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.webp"):
                targets.extend(list(p.rglob(ext)))
        else:
            for ext in ("*.jpg", "*.jpeg", "*.png", "*.tif", "*.tiff", "*.webp"):
                targets.extend(list(p.glob(ext)))
    elif p.is_file():
        targets = [p]
    else:
        logger.error("Path not found: %s", p)
        return

    if not targets:
        logger.error("No images found at: %s", p)
        return

    for img in sorted(targets):
        try:
            process_image(img, ocr, min_confidence=args.min_conf, save_debug=args.debug_image, out_dir=out_dir)
        except Exception as e:
            logger.exception("Failed processing %s: %s", img, e)

if __name__ == "__main__":
    main()
