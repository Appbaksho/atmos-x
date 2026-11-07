"""Settings (prompt-v1 §8.5). Reads the root .env, then apps/api/.env; extra keys are ignored.

Secrets are never logged. `integrations_off()` lists optional integrations that are disabled, by
name only, and `validate_for_env()` refuses unsafe production settings.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[1]
# apps/api → repo root in a checkout; inside the container the API lives at /app with no repo around it.
REPO_ROOT = API_DIR.parents[1] if len(API_DIR.parents) > 1 else API_DIR

PLACEHOLDER_SECRET = re.compile(r"change-me|replace|placeholder|^$", re.I)
PLACEHOLDER_CONTACT = re.compile(r"replace-with|example\.(com|org)|your-domain", re.I)

PIPELINE_VERSION = "heat-v1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(API_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://atmos:atmos@localhost:5433/atmos"
    jwt_secret: str = ""
    cookie_secure: bool = False
    public_web_origin: str = "http://localhost:3000"
    data_mode: str = "live"
    data_dir: str = "./data"

    earthdata_username: str = ""
    earthdata_password: str = ""
    earthdata_token: str = ""

    openaq_api_key: str = ""
    open_meteo_api_key: str = ""
    osm_user_agent: str = ""
    overpass_urls: str = (
        "https://overpass-api.de/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter,"
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    )

    ask_daily_limit_user: int = 30
    ask_daily_limit_guest: int = 5

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""

    sms_provider: str = "console"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_verify_service_sid: str = ""

    sslcommerz_store_id: str = ""
    sslcommerz_store_password: str = ""
    sslcommerz_sandbox: bool = True

    # Store and marketplace (prompt-v1 §6.9–§6.10). Prices are proposals; humans refine them (§14).
    vat_rate: float = 0.15
    points_per_bdt: float = 2.0  # M22: a listing's points price ≈ declared value × this rate
    points_price_tolerance: float = 0.25
    store_monthly_per_person: int = 4  # S15
    store_monthly_per_device: int = 6
    voucher_days: int = 14
    tree_package_bdt: float = 1500.0  # M5: one tree planted and cared for over 3 years
    store_listing_fee_bdt: float = 25000.0  # M7: per year
    fee_per_tree_bdt: float = 150.0  # R2: Atmos X fee recorded on each verified tree; the rest goes to the planter
    credit_price_bdt: float = 2500.0  # M6: per tonne, only once a lot is certified
    co2_kg_per_tree_year: float = 10.0  # young urban tree, rough estimate (labelled, never an offset)
    bank_transfer_min_bdt: float = 200000.0  # M14: bank transfer for large orders

    moderation_provider: str = "manual"
    google_vision_api_key: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = ""

    # The "Try the Dhaka demo" point (shared with the web app; public, not a secret).
    next_public_demo_lat: float = 23.7590
    next_public_demo_lng: float = 90.3590

    @field_validator("osm_user_agent", "overpass_urls", "vapid_subject", mode="before")
    @classmethod
    def _strip_quotes(cls, v: str) -> str:
        return (v or "").strip().strip('"').strip("'")

    # ── derived ──────────────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        return p if p.is_absolute() else (API_DIR / p).resolve()

    @property
    def user_agent(self) -> str:
        ua = self.osm_user_agent
        if ua and not PLACEHOLDER_CONTACT.search(ua):
            return ua
        return "AtmosX/1.0 (+https://github.com/Appbaksho/atmos-x)"

    @property
    def overpass_list(self) -> list[str]:
        return [u.strip() for u in self.overpass_urls.split(",") if u.strip()]

    @property
    def earthdata_enabled(self) -> bool:
        return bool(self.earthdata_token or (self.earthdata_username and self.earthdata_password))

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_oauth_client_id and self.google_oauth_client_secret)

    @property
    def sslcommerz_enabled(self) -> bool:
        return bool(self.sslcommerz_store_id and self.sslcommerz_store_password)

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key)

    @property
    def twilio_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_verify_service_sid)

    def integrations_off(self) -> list[str]:
        off = []
        if not self.earthdata_enabled:
            off.append("earthdata")
        if not self.openaq_api_key:
            off.append("openaq")
        if not self.open_meteo_api_key:
            off.append("open_meteo_paid")
        if not self.google_enabled:
            off.append("google_signin")
        if self.sms_provider == "twilio" and not self.twilio_enabled:
            off.append("twilio")
        if not self.sslcommerz_enabled:
            off.append("sslcommerz")
        if self.moderation_provider == "google_vision" and not self.google_vision_api_key:
            off.append("google_vision")
        if not self.push_enabled:
            off.append("web_push")
        return off

    def validate_for_env(self) -> None:
        if self.data_mode not in ("live", "fixture"):
            raise RuntimeError("DATA_MODE must be live or fixture")
        if self.is_production:
            problems = []
            if PLACEHOLDER_SECRET.search(self.jwt_secret) or len(self.jwt_secret) < 32:
                problems.append("JWT_SECRET is a placeholder or too short")
            if self.data_mode == "fixture":
                problems.append("DATA_MODE=fixture is not allowed in production")
            if self.sms_provider == "console":
                problems.append("SMS_PROVIDER=console is not allowed in production")
            if problems:
                raise RuntimeError("Refusing to start: " + "; ".join(problems))
        elif PLACEHOLDER_SECRET.search(self.jwt_secret) or len(self.jwt_secret) < 32:
            logging.getLogger("atmos").warning("config: JWT_SECRET is a placeholder; fine for development only")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
