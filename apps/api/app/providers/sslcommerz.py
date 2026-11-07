"""SSLCommerz v4 hosted checkout (prompt-v1 §6.10 M14). Sandbox only in this run.

Session: POST {host}/gwprocess/v4/api.php (form) → {status: SUCCESS, GatewayPageURL, sessionkey}.
Validation: GET {host}/validator/api/validationserverAPI.php?val_id&store_id&store_passwd&format=json
→ {status: VALID | VALIDATED | INVALID_TRANSACTION, tran_id, amount, currency, ...}.
Every success, fail, cancel and IPN result is validated server-to-server before an order changes.
"""

from __future__ import annotations

from ..config import settings
from ..http import UpstreamError, fetch

PROVIDER = "sslcommerz"


def host() -> str:
    return "https://sandbox.sslcommerz.com" if settings.sslcommerz_sandbox else "https://securepay.sslcommerz.com"


async def init_session(
    *,
    tran_id: str,
    amount: float,
    currency: str,
    product_name: str,
    product_category: str,
    customer: dict,
    callback_base: str,
    ipn_url: str,
) -> dict:
    if not settings.sslcommerz_enabled:
        raise UpstreamError(PROVIDER, "SSLCommerz is not configured")
    data = {
        "store_id": settings.sslcommerz_store_id,
        "store_passwd": settings.sslcommerz_store_password,
        "total_amount": f"{amount:.2f}",
        "currency": currency,
        "tran_id": tran_id,
        "success_url": f"{callback_base}/success",
        "fail_url": f"{callback_base}/fail",
        "cancel_url": f"{callback_base}/cancel",
        "ipn_url": ipn_url,
        "cus_name": customer.get("name") or "Atmos X customer",
        "cus_email": customer.get("email") or "noreply@atmosx.app",
        "cus_phone": customer.get("phone") or "01700000000",
        "cus_add1": customer.get("address") or "Dhaka",
        "cus_city": customer.get("city") or "Dhaka",
        "cus_country": "Bangladesh",
        "shipping_method": "NO",
        "num_of_item": "1",
        "product_name": product_name[:250],
        "product_category": product_category,
        "product_profile": "non-physical-goods",
    }
    r = await fetch(PROVIDER, "POST", f"{host()}/gwprocess/v4/api.php", data=data, timeout=20)
    j = r.json()
    if str(j.get("status", "")).upper() != "SUCCESS" or not j.get("GatewayPageURL"):
        raise UpstreamError(PROVIDER, f"session failed: {str(j.get('failedreason') or j.get('status'))[:120]}")
    return {"url": j["GatewayPageURL"], "sessionkey": j.get("sessionkey")}


async def validate(val_id: str) -> dict:
    params = {
        "val_id": val_id,
        "store_id": settings.sslcommerz_store_id,
        "store_passwd": settings.sslcommerz_store_password,
        "format": "json",
        "v": "1",
    }
    r = await fetch(
        PROVIDER, "GET", f"{host()}/validator/api/validationserverAPI.php", params=params, timeout=20, retries=1
    )
    return r.json()


def is_valid(v: dict, *, tran_id: str, amount: float, currency: str) -> bool:
    """VALID or VALIDATED, the same transaction id, the same currency and the full amount."""
    if str(v.get("status", "")).upper() not in ("VALID", "VALIDATED"):
        return False
    if v.get("tran_id") != tran_id:
        return False
    if str(v.get("currency_type") or v.get("currency") or "").upper() != currency.upper():
        return False
    try:
        paid = float(v.get("currency_amount") or v.get("amount"))
    except (TypeError, ValueError):
        return False
    return abs(paid - amount) < 0.01
