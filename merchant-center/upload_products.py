"""
Beautasy — Google Merchant Center product uploader
Source ID : 10658278647
Source name: BEAUTASY_API

Requirements:
    pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client requests tenacity python-dotenv

Setup:
    1. In Google Cloud Console create an OAuth 2.0 Desktop client and download
       the JSON file as  merchant-center/credentials.json
    2. Run once interactively so the browser OAuth flow saves token.json
    3. Subsequent runs are fully headless (token is refreshed automatically)
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

# ─── Config ───────────────────────────────────────────────────────────────────

load_dotenv()

BASE_DIR = Path(__file__).parent
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

# Your Merchant Center account ID (find it in Settings → Account)
MERCHANT_ID = os.getenv("MERCHANT_ID", "YOUR_MERCHANT_ID_HERE")

# The Content API v2.1 base URL
API_BASE = f"https://shoppingcontent.googleapis.com/content/v2.1/{MERCHANT_ID}"

SCOPES = ["https://www.googleapis.com/auth/content"]

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(BASE_DIR / "upload.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("beautasy.merchant")


# ─── Auth ─────────────────────────────────────────────────────────────────────

def get_credentials() -> Credentials:
    """Return valid OAuth2 credentials, running browser flow on first use."""
    creds: Credentials | None = None

    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            log.info("Refreshing access token…")
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                log.error(
                    "credentials.json not found — download it from Google Cloud "
                    "Console (OAuth 2.0 → Desktop client) and place it at %s",
                    CREDENTIALS_FILE,
                )
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), SCOPES
            )
            creds = flow.run_local_server(port=0)

        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        log.info("Token saved to %s", TOKEN_FILE)

    return creds


def auth_header(creds: Credentials) -> dict[str, str]:
    """Return Authorization header dict, refreshing token if needed."""
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return {"Authorization": f"Bearer {creds.token}"}


# ─── Retry decorator ──────────────────────────────────────────────────────────

@retry(
    retry=retry_if_exception_type(requests.HTTPError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def _request_with_retry(
    method: str, url: str, headers: dict, **kwargs: Any
) -> requests.Response:
    resp = requests.request(method, url, headers=headers, timeout=30, **kwargs)
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", 10))
        log.warning("Rate limited — sleeping %ds", retry_after)
        time.sleep(retry_after)
        resp.raise_for_status()
    elif resp.status_code >= 500:
        resp.raise_for_status()
    return resp


# ─── Product helpers ──────────────────────────────────────────────────────────

def build_product(raw: dict) -> dict:
    """
    Convert a Beautasy product dict into a Google Content API product resource.

    Expected raw keys:
        id, title, description, price_pence, availability,
        image_url, product_url, category (optional), sizes (optional list)
    """
    price_gbp = f"{raw['price_pence'] / 100:.2f}"

    # offerId must be unique and ≤50 chars
    raw_id = f"BEAUTASY_{raw['id']}"
    offer_id = raw_id if len(raw_id) <= 50 else f"B_{raw['id'][-40:]}"

    product: dict[str, Any] = {
        "offerId": offer_id,
        "title": raw["title"],
        "description": raw.get("description", raw["title"]),
        "link": raw["product_url"],
        "imageLink": raw["image_url"],
        "contentLanguage": "en",
        "targetCountry": "GB",
        "channel": "online",
        "availability": raw.get("availability", "in stock"),
        "condition": "new",
        "brand": "Beautasy",
        "price": {"value": price_gbp, "currency": "GBP"},
        # feedLabel links to the BEAUTASY_API data source in Merchant Center
        "feedLabel": "GB",
    }

    # Optional: Google product category
    if raw.get("category"):
        product["googleProductCategory"] = raw["category"]

    # Apparel required attributes
    if raw.get("gender"):
        product["gender"] = raw["gender"]
    if raw.get("age_group"):
        product["ageGroup"] = raw["age_group"]
    if raw.get("color"):
        product["color"] = raw["color"]

    # Optional: size variants (creates separate offers per size)
    # Caller is responsible for passing one dict per size when needed.
    if raw.get("size"):
        product["sizes"] = [raw["size"]]
        product["sizeSystem"] = "UK"

    return product


# ─── API calls ────────────────────────────────────────────────────────────────

def insert_product(creds: Credentials, product: dict) -> dict:
    """Insert (create or full-replace) a single product."""
    url = f"{API_BASE}/products"
    headers = {**auth_header(creds), "Content-Type": "application/json"}
    resp = _request_with_retry("POST", url, headers, json=product)
    resp.raise_for_status()
    return resp.json()


def update_product(creds: Credentials, product_id: str, product: dict) -> dict:
    """Patch an existing product (partial update via PATCH)."""
    url = f"{API_BASE}/products/{product_id}"
    headers = {**auth_header(creds), "Content-Type": "application/json"}
    resp = _request_with_retry("PATCH", url, headers, json=product)
    resp.raise_for_status()
    return resp.json()


def delete_product(creds: Credentials, product_id: str) -> None:
    """Remove a product from Merchant Center."""
    url = f"{API_BASE}/products/{product_id}"
    resp = _request_with_retry("DELETE", url, auth_header(creds))
    if resp.status_code not in (200, 204, 404):
        resp.raise_for_status()
    log.info("Deleted %s", product_id)


def list_products(creds: Credentials, max_results: int = 250) -> list[dict]:
    """Return all products currently in Merchant Center (paginated)."""
    results: list[dict] = []
    url = f"{API_BASE}/products?maxResults={max_results}"
    while url:
        resp = _request_with_retry("GET", url, auth_header(creds))
        resp.raise_for_status()
        data = resp.json()
        results.extend(data.get("resources", []))
        next_token = data.get("nextPageToken")
        url = (
            f"{API_BASE}/products?maxResults={max_results}&pageToken={next_token}"
            if next_token
            else None
        )
    log.info("Found %d products in Merchant Center", len(results))
    return results


def batch_insert(creds: Credentials, products: list[dict]) -> dict:
    """
    Insert up to 1 000 products in a single custombatch call.
    Splits automatically if len(products) > 1000.
    """
    CHUNK = 1000
    all_responses: dict[str, Any] = {"entries": []}

    for chunk_start in range(0, len(products), CHUNK):
        chunk = products[chunk_start : chunk_start + CHUNK]
        entries = [
            {
                "batchId": i,
                "merchantId": MERCHANT_ID,
                "method": "insert",
                "product": p,
            }
            for i, p in enumerate(chunk)
        ]
        url = "https://shoppingcontent.googleapis.com/content/v2.1/products/batch"
        headers = {**auth_header(creds), "Content-Type": "application/json"}
        resp = _request_with_retry(
            "POST", url, headers, json={"entries": entries}
        )
        if not resp.ok:
            log.error("Batch error %s: %s", resp.status_code, resp.text[:2000])
        resp.raise_for_status()
        data = resp.json()
        all_responses["entries"].extend(data.get("entries", []))
        log.info(
            "Batch chunk %d–%d submitted (%d entries)",
            chunk_start,
            chunk_start + len(chunk) - 1,
            len(chunk),
        )

    return all_responses


# ─── Reporting ────────────────────────────────────────────────────────────────

def report_batch_results(batch_response: dict) -> None:
    ok = err = 0
    for entry in batch_response.get("entries", []):
        if "errors" in entry:
            err += 1
            for e in entry["errors"].get("errors", []):
                log.error(
                    "Batch entry %s error [%s]: %s",
                    entry.get("batchId"),
                    e.get("reason"),
                    e.get("message"),
                )
        else:
            ok += 1
    log.info("Batch complete — success: %d  errors: %d", ok, err)


# ─── Example / demo ───────────────────────────────────────────────────────────

SAMPLE_PRODUCTS: list[dict] = [
    {
        "id": "silk-bralette-s",
        "title": "Silk Bralette — S",
        "description": "Handmade silk bralette crafted in our Southampton studio. Soft, luxurious, made to order.",
        "price_pence": 3499,
        "availability": "in stock",
        "image_url": "https://beautasy.co.uk/images/silk-bralette.jpg",
        "product_url": "https://beautasy.co.uk/shop/silk-bralette",
        "category": "Apparel & Accessories > Clothing > Underwear & Socks > Bras",
        "size": "S",
    },
    {
        "id": "linen-tote-bag",
        "title": "Linen Tote Bag",
        "description": "Handmade linen tote bag with embroidered Beautasy logo.",
        "price_pence": 2499,
        "availability": "in stock",
        "image_url": "https://beautasy.co.uk/images/linen-tote.jpg",
        "product_url": "https://beautasy.co.uk/shop/linen-tote-bag",
        "category": "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
    },
]


def main() -> None:
    if MERCHANT_ID == "YOUR_MERCHANT_ID_HERE":
        log.error(
            "Set MERCHANT_ID in .env or edit the constant at the top of this script."
        )
        sys.exit(1)

    log.info("Authenticating…")
    creds = get_credentials()

    # ── Option A: single insert (good for testing) ──────────────────────────
    log.info("Inserting sample product…")
    product_payload = build_product(SAMPLE_PRODUCTS[0])
    result = insert_product(creds, product_payload)
    log.info("Inserted: %s", result.get("id"))

    # ── Option B: batch insert all samples ──────────────────────────────────
    # payloads = [build_product(p) for p in SAMPLE_PRODUCTS]
    # batch_resp = batch_insert(creds, payloads)
    # report_batch_results(batch_resp)

    # ── Option C: load from JSON file ───────────────────────────────────────
    # products_file = BASE_DIR / "products.json"
    # raw_list = json.loads(products_file.read_text())
    # payloads = [build_product(p) for p in raw_list]
    # batch_resp = batch_insert(creds, payloads)
    # report_batch_results(batch_resp)

    log.info("Done.")


if __name__ == "__main__":
    main()
