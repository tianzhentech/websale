import { NextRequest, NextResponse } from "next/server";

import {
  normalizeBackendApiBaseUrl,
  readAdminRuntimeConfig,
  writeAdminRuntimeConfig,
} from "@/lib/admin-config";
import {
  ADMIN_NOTICE_COOKIE_NAME,
  isAdminNoticeSessionValid,
} from "@/lib/notice-board";
import { readServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_API_BASE_URL_ENV = "PIXEL_WEBSALE_API_BASE_URL";
const DEFAULT_BACKEND_API_BASE_URL = "http://127.0.0.1:8006";
const SHARED_ADMIN_PASSWORD_ENV = "PIXEL_ADMIN_PASSWORD";
const LEGACY_ADMIN_PASSWORD_ENV = "PIXEL_WEBSALE_ADMIN_PASSWORD";
const DEFAULT_ADMIN_PASSWORD = "123456";

type AdminConfigPayload = {
  backend_api_base_url?: string | null;
  backend_api_password?: string | null;
  extract_link_enabled?: boolean;
  subscription_enabled?: boolean;
};

function resolveRouteLanguage(request: NextRequest) {
  const language = request.headers.get("x-ui-language");
  return language === "zh" ? "zh" : "en";
}

function isAuthorized(request: NextRequest) {
  return isAdminNoticeSessionValid(request.cookies.get(ADMIN_NOTICE_COOKIE_NAME)?.value);
}

function resolveDefaultBackendApiBaseUrl() {
  return (
    readServerEnv(BACKEND_API_BASE_URL_ENV) || DEFAULT_BACKEND_API_BASE_URL
  ).replace(/\/+$/, "");
}

function resolveDefaultBackendApiPassword() {
  return (
    readServerEnv(SHARED_ADMIN_PASSWORD_ENV) ||
    readServerEnv(LEGACY_ADMIN_PASSWORD_ENV) ||
    DEFAULT_ADMIN_PASSWORD
  );
}

async function buildResponsePayload() {
  const config = await readAdminRuntimeConfig();
  const defaultBackendApiBaseUrl = resolveDefaultBackendApiBaseUrl();
  const defaultBackendApiPassword = resolveDefaultBackendApiPassword();

  return {
    backend_api_base_url: config.backend_api_base_url || defaultBackendApiBaseUrl,
    backend_api_base_url_override: config.backend_api_base_url,
    backend_api_password: config.backend_api_password || defaultBackendApiPassword,
    backend_api_password_override: config.backend_api_password,
    extract_link_enabled: config.extract_link_enabled,
    subscription_enabled: config.subscription_enabled,
    default_backend_api_base_url: defaultBackendApiBaseUrl,
    default_backend_api_password: defaultBackendApiPassword,
    updated_at: config.updated_at,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unauthorized." : "未授权。" },
      { status: 401 }
    );
  }

  return NextResponse.json(await buildResponsePayload());
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unauthorized." : "未授权。" },
      { status: 401 }
    );
  }

  try {
    const payload = (await request.json().catch(() => null)) as AdminConfigPayload | null;
    const normalizedRequestedBackendApiBaseUrl =
      typeof payload?.backend_api_base_url === "string"
        ? normalizeBackendApiBaseUrl(payload.backend_api_base_url)
        : undefined;
    const normalizedRequestedBackendApiPassword =
      typeof payload?.backend_api_password === "string"
        ? payload.backend_api_password.trim()
        : undefined;
    const extractLinkEnabled =
      typeof payload?.extract_link_enabled === "boolean"
        ? payload.extract_link_enabled
        : undefined;
    const subscriptionEnabled =
      typeof payload?.subscription_enabled === "boolean"
        ? payload.subscription_enabled
        : undefined;

    await writeAdminRuntimeConfig({
      backend_api_base_url:
        normalizedRequestedBackendApiBaseUrl === resolveDefaultBackendApiBaseUrl()
          ? null
          : normalizedRequestedBackendApiBaseUrl,
      backend_api_password:
        normalizedRequestedBackendApiPassword === resolveDefaultBackendApiPassword()
          ? null
          : normalizedRequestedBackendApiPassword,
      extract_link_enabled: extractLinkEnabled,
      subscription_enabled: subscriptionEnabled,
    });

    return NextResponse.json(await buildResponsePayload());
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error && error.message.trim()
            ? error.message
            : resolveRouteLanguage(request) === "en"
              ? "Unexpected server error."
              : "服务器异常。",
      },
      { status: error instanceof Error ? 400 : 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unauthorized." : "未授权。" },
      { status: 401 }
    );
  }

  await writeAdminRuntimeConfig({
    backend_api_base_url: null,
    backend_api_password: null,
  });
  return NextResponse.json(await buildResponsePayload());
}
