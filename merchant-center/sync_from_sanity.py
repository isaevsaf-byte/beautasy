"""
Beautasy — Sync products from Sanity CMS → Google Merchant Center

This script fetches all published products from Sanity and upserts them
into Google Merchant Center via the Content API.

Usage:
    python sync_from_sanity.py              # dry-run (print only)
    python sync_from_sanity.py --upload     # actually push to Merchant Center
    python sync_from_sanity.py --delete-unlisted  # also remove products no longer in Sanity
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

from upload_products import (
    batch_insert,
    build_product,
    delete_product,
    get_credentials,
    list_products,
    report_batch_results,
)

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────

SANITY_PROJECT_ID = os.getenv("SANITY_PROJECT_ID", "5uun6fw6")
SANITY_DATASET = os.getenv("SANITY_DATASET", "production")
SANITY_TOKEN = os.getenv("SANITY_TOKEN", "")          # read token from .env
SITE_URL = "https://beautasy.co.uk"

BASE_DIR = Path(__file__).parent

log = logging.getLogger("beautasy.sync")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(BASE_DIR / "sync.log", encoding="utf-8"),
    ],
)

# ─── Sanity helpers ───────────────────────────────────────────────────────────

SANITY_QUERY = """
*[_type == "product" && defined(slug.current)] | order(_createdAt desc) {
  _id,
  name,
  "slug": slug.current,
  price,
  description,
  category,
  subcategory,
  gender,
  ageGroup,
  color,
  stock,
  availableSizes,
  sizePrices,
  "images": images[]{
    "url": asset->url
  }
}
"""


def fetch_sanity_products() -> list[dict]:
    url = (
        f"https://{SANITY_PROJECT_ID}.api.sanity.io/v2023-05-03/data/query/"
        f"{SANITY_DATASET}"
    )
    headers = {}
    if SANITY_TOKEN:
        headers["Authorization"] = f"Bearer {SANITY_TOKEN}"

    resp = requests.get(
        url,
        params={"query": SANITY_QUERY},
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json().get("result", [])
    log.info("Fetched %d products from Sanity", len(result))
    return result


# ─── Category mapping ─────────────────────────────────────────────────────────

GOOGLE_CATEGORY: dict[str, str] = {
    "Lingerie": "Apparel & Accessories > Clothing > Underwear & Socks",
    "Kids": "Apparel & Accessories > Clothing > Baby & Toddler Clothing",
    "Accessories": "Apparel & Accessories > Handbags, Wallets & Cases",
    "Home": "Home & Garden > Decor",
}

# Apparel categories that require gender/age_group/color
APPAREL_CATEGORIES = {"Lingerie", "Kids", "Accessories"}

AGE_GROUP: dict[str, str] = {
    "Lingerie": "adult",
    "Kids": "kids",
    "Accessories": "adult",
    "Home": "adult",
}

# Map Beautasy kids sizes to Google age groups
SIZE_AGE_GROUP: dict[str, str] = {
    "1-1.5Y": "toddler",   # 1–5 years
    "2-3Y":   "toddler",
    "4-5Y":   "toddler",
    "6-7Y":   "kids",      # 5–13 years
    "8-9Y":   "kids",
    "10-11Y": "kids",
    "12-13Y": "kids",
}


# ─── Conversion ───────────────────────────────────────────────────────────────

def sanity_to_merchant(p: dict) -> list[dict]:
    """
    Convert one Sanity product into one or more Merchant Center product dicts.
    If availableSizes is set we create one offer per size; otherwise one offer.
    """
    images = p.get("images") or []
    image_url = images[0]["url"] if images else f"{SITE_URL}/beautasy-icon.png"
    product_url = f"{SITE_URL}/shop/{p['slug']}"
    availability = "in stock" if (p.get("stock") or 0) > 0 else "out of stock"
    google_cat = GOOGLE_CATEGORY.get(p.get("category", ""), "")

    # Build a plain-text description from portable-text blocks if present
    description = ""
    if isinstance(p.get("description"), list):
        for block in p["description"]:
            for child in block.get("children", []):
                description += child.get("text", "")
        description = description.strip()
    if not description:
        description = f"Handmade {p.get('category', 'product').lower()} by Beautasy, Southampton."

    sizes: list[str] = p.get("availableSizes") or []
    size_prices: dict[str, int] = {
        sp["size"]: sp["price"]
        for sp in (p.get("sizePrices") or [])
        if "size" in sp and "price" in sp
    }

    category = p.get("category", "")
    is_apparel = category in APPAREL_CATEGORIES

    # Use values set in Sanity, fall back to category defaults
    gender   = p.get("gender") or ("female" if is_apparel else None)
    age_group = p.get("ageGroup") or AGE_GROUP.get(category)
    color    = p.get("color") or ("Assorted" if is_apparel else None)

    base = {
        "title": p["name"],
        "description": description,
        "price_pence": p.get("price", 0),
        "availability": availability,
        "image_url": image_url,
        "product_url": product_url,
        "category": google_cat,
        "gender": gender,
        "age_group": age_group,
        "color": color,
    }

    if sizes:
        variants = []
        for size in sizes:
            variant_price = size_prices.get(size, p.get("price", 0))
            # For kids products, override age_group per size
            size_age = SIZE_AGE_GROUP.get(size, base.get("age_group"))
            variants.append(
                {
                    **base,
                    "id": f"{p['slug']}-{size}",
                    "price_pence": variant_price,
                    "size": size,
                    "age_group": size_age,
                }
            )
        return variants
    else:
        return [{**base, "id": p["slug"]}]


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Sanity → Merchant Center")
    parser.add_argument(
        "--upload", action="store_true", help="Actually push products (default: dry-run)"
    )
    parser.add_argument(
        "--delete-unlisted",
        action="store_true",
        help="Delete MC products whose offerId is no longer in Sanity",
    )
    args = parser.parse_args()

    sanity_products = fetch_sanity_products()

    # Build all MC payloads
    all_payloads: list[dict] = []
    for sp in sanity_products:
        try:
            all_payloads.extend(sanity_to_merchant(sp))
        except Exception as exc:
            log.warning("Skipping product %s — %s", sp.get("slug"), exc)

    log.info("Prepared %d Merchant Center offers", len(all_payloads))

    if not args.upload:
        log.info("DRY RUN — pass --upload to actually send to Merchant Center")
        for p in all_payloads[:5]:
            log.info("  sample: %s  £%.2f  %s", p["id"], p["price_pence"] / 100, p["availability"])
        return

    creds = get_credentials()

    # Upload
    mc_payloads = [build_product(p) for p in all_payloads]
    batch_resp = batch_insert(creds, mc_payloads)
    report_batch_results(batch_resp)

    # Optionally delete products no longer in Sanity
    if args.delete_unlisted:
        sanity_offer_ids = {
            f"BEAUTASY_{p['id']}" for p in all_payloads
        }
        mc_products = list_products(creds)
        for mc_p in mc_products:
            offer_id = mc_p.get("offerId", "")
            if offer_id not in sanity_offer_ids:
                log.info("Deleting unlisted product: %s", offer_id)
                delete_product(creds, mc_p["id"])

    log.info("Sync complete.")


if __name__ == "__main__":
    main()
