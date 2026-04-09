import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_OVERVIEW_ACTIVITY_WINDOW_MINUTES,
  normalizeBackendApiBaseUrl,
  normalizeOverviewActivityWindowMinutes,
  readAdminRuntimeConfig,
  writeAdminRuntimeConfig,
} from "@/lib/admin-config";
import {
  ADMIN_NOTICE_COOKIE_NAME,
  isAdminNoticeSessionValid,
  readNoticeMarkdown,
} from "@/lib/notice-board";
import {
  DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT,
  DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE,
  normalizeNoticeTranslationSystemPrompt,
  normalizeNoticeTranslationUserPromptTemplate,
} from "@/lib/notice-translation-prompts";
import { queueNoticeTranslationCopies } from "@/lib/notice-translation";
import { readServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_API_BASE_URL_ENV = "PIXEL_WEBSALE_API_BASE_URL";
const BACKEND_API_PASSWORD_ENV = "PIXEL_WEBSALE_API_PASSWORD";
const DEFAULT_BACKEND_API_BASE_URL = "http://127.0.0.1:8006";
const DEFAULT_ADMIN_PASSWORD = "123456";

type AdminConfigPayload = {
  backend_api_base_url?: string | null;
  backend_api_password?: string | null;
  extract_link_enabled?: boolean;
  subscription_enabled?: boolean;
  overview_activity_window_minutes?: number | string | null;
  notice_translation_system_prompt?: string | null;
  notice_translation_user_prompt_template?: string | null;
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
  return readServerEnv(BACKEND_API_PASSWORD_ENV) || DEFAULT_ADMIN_PASSWORD;
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
    overview_activity_window_minutes: config.overview_activity_window_minutes,
    notice_translation_system_prompt:
      config.notice_translation_system_prompt || DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT,
    notice_translation_system_prompt_override: config.notice_translation_system_prompt,
    notice_translation_user_prompt_template:
      config.notice_translation_user_prompt_template || DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE,
    notice_translation_user_prompt_template_override:
      config.notice_translation_user_prompt_template,
    default_backend_api_base_url: defaultBackendApiBaseUrl,
    default_backend_api_password: defaultBackendApiPassword,
    default_overview_activity_window_minutes: DEFAULT_OVERVIEW_ACTIVITY_WINDOW_MINUTES,
    default_notice_translation_system_prompt: DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT,
    default_notice_translation_user_prompt_template:
      DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE,
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
    const overviewActivityWindowMinutes =
      payload?.overview_activity_window_minutes === undefined
        ? undefined
        : normalizeOverviewActivityWindowMinutes(payload.overview_activity_window_minutes);
    const normalizedRequestedSystemPrompt =
      payload?.notice_translation_system_prompt === undefined
        ? undefined
        : normalizeNoticeTranslationSystemPrompt(payload.notice_translation_system_prompt);
    const normalizedRequestedUserPromptTemplate =
      payload?.notice_translation_user_prompt_template === undefined
        ? undefined
        : normalizeNoticeTranslationUserPromptTemplate(payload.notice_translation_user_prompt_template);

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
      overview_activity_window_minutes: overviewActivityWindowMinutes,
      notice_translation_system_prompt:
        normalizedRequestedSystemPrompt === DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT
          ? null
          : normalizedRequestedSystemPrompt,
      notice_translation_user_prompt_template:
        normalizedRequestedUserPromptTemplate === DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE
          ? null
          : normalizedRequestedUserPromptTemplate,
    });

    if (
      payload?.notice_translation_system_prompt !== undefined ||
      payload?.notice_translation_user_prompt_template !== undefined
    ) {
      await queueNoticeTranslationCopies(await readNoticeMarkdown());
    }

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
