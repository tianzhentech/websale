#!/usr/bin/env python3
"""Legacy compatibility proxy for Pixel WebSale.

The Next.js app now serves its own /api routes directly and does not require
this module during normal development or deployment.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote

import requests
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


BACKEND_API_BASE_URL_ENV = "PIXEL_WEBSALE_API_BASE_URL"
DEFAULT_BACKEND_API_BASE_URL = "http://127.0.0.1:8006"
BACKEND_API_TIMEOUT_ENV = "PIXEL_WEBSALE_API_TIMEOUT"
DEFAULT_BACKEND_API_TIMEOUT = 15.0
SHARED_ADMIN_PASSWORD_ENV = "PIXEL_ADMIN_PASSWORD"
LEGACY_ADMIN_PASSWORD_ENV = "PIXEL_WEBSALE_ADMIN_PASSWORD"
DEFAULT_ADMIN_PASSWORD = "123456"
BACKEND_ADMIN_PASSWORD_HEADER = "x-pixel-admin-password"
SITE_TITLE_ENV = "PIXEL_WEBSALE_SITE_TITLE"
DEFAULT_SITE_TITLE = "Pixel CDK Exchange"
RUN_MODE_LABELS = {
    "extract_link": "提链模式",
    "subscription": "订阅模式",
}
RUN_MODE_PRICING = {
    "extract_link": 4,
    "subscription": 8,
}
STATUS_LABELS = {
    "active": "生效",
    "exhausted": "已耗尽",
    "merged": "已合并",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_site_title() -> str:
    return str(os.getenv(SITE_TITLE_ENV, DEFAULT_SITE_TITLE)).strip() or DEFAULT_SITE_TITLE


def resolve_backend_api_base_url() -> str:
    raw_value = str(
        os.getenv(BACKEND_API_BASE_URL_ENV, DEFAULT_BACKEND_API_BASE_URL)
    ).strip()
    if not raw_value:
        return DEFAULT_BACKEND_API_BASE_URL
    return raw_value.rstrip("/")


def resolve_backend_api_timeout() -> float:
    raw_value = str(
        os.getenv(BACKEND_API_TIMEOUT_ENV, str(DEFAULT_BACKEND_API_TIMEOUT))
    ).strip()
    try:
        timeout = float(raw_value)
    except ValueError:
        return DEFAULT_BACKEND_API_TIMEOUT
    return timeout if timeout > 0 else DEFAULT_BACKEND_API_TIMEOUT


def resolve_backend_admin_password() -> str:
    return (
        str(os.getenv(SHARED_ADMIN_PASSWORD_ENV, "")).strip()
        or str(os.getenv(LEGACY_ADMIN_PASSWORD_ENV, "")).strip()
        or DEFAULT_ADMIN_PASSWORD
    )


def _backend_url(path: str) -> str:
    return f"{resolve_backend_api_base_url()}/{path.lstrip('/')}"


def _response_payload(response: requests.Response) -> object:
    try:
        return response.json()
    except ValueError:
        text = response.text.strip()
        return {"detail": text} if text else {}


def _response_error_detail(response: requests.Response) -> str:
    payload = _response_payload(response)
    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
        if payload:
            return json.dumps(payload, ensure_ascii=False)
    if isinstance(payload, list) and payload:
        return json.dumps(payload, ensure_ascii=False)
    text = response.text.strip()
    if text:
        return text
    return f"Backend API returned HTTP {response.status_code}."


def _backend_request(
    method: str,
    path: str,
    *,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    try:
        response = requests.request(
            method.upper(),
            _backend_url(path),
            json=payload,
            headers={
                BACKEND_ADMIN_PASSWORD_HEADER: resolve_backend_admin_password(),
            },
            timeout=resolve_backend_api_timeout(),
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach backend API: {exc}",
        ) from exc

    if response.status_code >= 400:
        status_code = response.status_code if response.status_code < 500 else 502
        raise HTTPException(
            status_code=status_code,
            detail=_response_error_detail(response),
        )

    data = _response_payload(response)
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="Backend API returned an unexpected payload.",
        )
    return data


def _build_affordable_modes(
    cdk: dict[str, object],
    pricing: dict[str, int],
) -> list[dict[str, object]]:
    status = str(cdk.get("status") or "")
    remaining_amount = int(cdk.get("remaining_amount") or 0)
    can_exchange = status == "active" and remaining_amount > 0
    modes: list[dict[str, object]] = []

    for run_mode, label in RUN_MODE_LABELS.items():
        price = int(pricing.get(run_mode) or 0)
        affordable = can_exchange and price > 0 and remaining_amount >= price
        modes.append(
            {
                "run_mode": run_mode,
                "label": label,
                "price": price,
                "affordable": affordable,
                "shortfall": max(0, price - remaining_amount),
            }
        )

    return modes


def _normalize_detail_payload(detail: dict[str, object]) -> dict[str, object]:
    cdk = detail.get("cdk")
    if not isinstance(cdk, dict):
        raise HTTPException(status_code=502, detail="Backend detail response is missing CDK data.")

    pricing_raw = detail.get("pricing")
    pricing: dict[str, int] = {}
    if isinstance(pricing_raw, dict):
        pricing = {
            str(key): int(value)
            for key, value in pricing_raw.items()
            if str(key) in RUN_MODE_LABELS
        }

    if not pricing:
        pricing = dict(RUN_MODE_PRICING)

    status = str(cdk.get("status") or "")
    remaining_amount = int(cdk.get("remaining_amount") or 0)
    modes = _build_affordable_modes(cdk, pricing)

    return {
        "cdk": cdk,
        "transactions": detail.get("transactions") if isinstance(detail.get("transactions"), list) else [],
        "pricing": pricing,
        "run_modes": modes,
        "status_label": STATUS_LABELS.get(status, status or "未知状态"),
        "can_exchange": status == "active" and remaining_amount > 0,
    }


def normalize_pricing_payload(value: object) -> dict[str, int]:
    pricing = dict(RUN_MODE_PRICING)
    if isinstance(value, dict):
        source = value.get("pricing") if isinstance(value.get("pricing"), dict) else value
        if isinstance(source, dict):
            for run_mode in RUN_MODE_LABELS:
                next_value = source.get(run_mode)
                try:
                    parsed = int(next_value)
                except (TypeError, ValueError):
                    continue
                if parsed > 0:
                    pricing[run_mode] = parsed
    return pricing


def fetch_remote_cdk_detail(code: str) -> dict[str, object]:
    normalized_code = str(code or "").strip()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="CDK code is required.")
    detail = _backend_request("GET", f"/api/cdks/{quote(normalized_code, safe='')}")
    return _normalize_detail_payload(detail)


def fetch_remote_pricing() -> dict[str, int]:
    payload = _backend_request("GET", "/api/settings/pricing")
    return normalize_pricing_payload(payload)


def preview_exchange(code: str) -> dict[str, object]:
    detail = fetch_remote_cdk_detail(code)
    return {
        "generated_at": utc_now(),
        "detail": detail,
    }


def exchange_cdk(code: str, run_mode: str) -> dict[str, object]:
    normalized_code = str(code or "").strip()
    normalized_run_mode = str(run_mode or "").strip()
    if normalized_run_mode not in RUN_MODE_LABELS:
        raise HTTPException(status_code=400, detail=f"Unsupported run mode: {run_mode}")

    preview = fetch_remote_cdk_detail(normalized_code)
    cdk = preview["cdk"]
    pricing = preview["pricing"]
    remaining_amount = int(cdk.get("remaining_amount") or 0)
    status = str(cdk.get("status") or "")
    price = int(pricing.get(normalized_run_mode) or 0)

    if status != "active" or remaining_amount <= 0:
        raise HTTPException(status_code=409, detail="This CDK is not available for exchange.")
    if price <= 0:
        raise HTTPException(status_code=400, detail=f"No pricing configured for {normalized_run_mode}.")
    if remaining_amount < price:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Insufficient balance for {RUN_MODE_LABELS[normalized_run_mode]} "
                f"(requires {price}, remaining {remaining_amount})."
            ),
        )

    exchange_id = uuid.uuid4().hex
    note = f"websale exchange {exchange_id}"
    _backend_request(
        "POST",
        "/api/cdks/redeem",
        payload={
            "code": normalized_code,
            "reference_id": f"websale-redeem-{exchange_id}",
            "note": note,
        },
    )
    consume_result = _backend_request(
        "POST",
        "/api/cdks/consume",
        payload={
            "code": normalized_code,
            "run_mode": normalized_run_mode,
            "reference_id": f"websale-consume-{exchange_id}",
            "note": note,
        },
    )
    updated_detail = fetch_remote_cdk_detail(normalized_code)

    return {
        "generated_at": utc_now(),
        "exchange": {
            "exchange_id": exchange_id,
            "code": normalized_code,
            "run_mode": normalized_run_mode,
            "run_mode_label": RUN_MODE_LABELS[normalized_run_mode],
            "charged_amount": int(consume_result.get("charged_amount") or price),
            "transaction": consume_result.get("transaction"),
            "cdk": consume_result.get("cdk"),
        },
        "detail": updated_detail,
    }


class CdkPreviewRequest(BaseModel):
    code: str = Field(min_length=1, max_length=255)


class CdkExchangeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=255)
    run_mode: Literal["extract_link", "subscription"]


app = FastAPI(
    title="Pixel WebSale",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.get("/", include_in_schema=False)
def index():
    return {
        "service": "Pixel WebSale API",
        "generated_at": utc_now(),
        "message": "Legacy compatibility server. The Next.js app now handles /api routes directly.",
        "backend_api_base_url": resolve_backend_api_base_url(),
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "generated_at": utc_now(),
        "backend_api_base_url": resolve_backend_api_base_url(),
    }


@app.get("/api/config")
def get_config():
    pricing = fetch_remote_pricing()
    return {
        "generated_at": utc_now(),
        "site_title": resolve_site_title(),
        "backend_api_base_url": resolve_backend_api_base_url(),
        "pricing": pricing,
        "run_modes": [
            {"run_mode": run_mode, "label": label, "price": pricing.get(run_mode, 0)}
            for run_mode, label in RUN_MODE_LABELS.items()
        ],
    }


@app.post("/api/preview")
def preview_one_cdk(payload: CdkPreviewRequest):
    return preview_exchange(payload.code)


@app.post("/api/exchange")
def exchange_one_cdk(payload: CdkExchangeRequest):
    return exchange_cdk(payload.code, payload.run_mode)


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8010")),
        reload=False,
    )
