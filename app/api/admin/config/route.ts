import { NextRequest, NextResponse } from "next/server";

import {
  normalizeAiApiBaseUrl,
  normalizeAiApiKey,
  normalizeAiModel,
  normalizeBackendApiBaseUrl,
  normalizeBackendApiPassword,
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
  normalizeNoticeTranslationSystemPrompt,
  normalizeNoticeTranslationUserPromptTemplate,
} from "@/lib/notice-translation-prompts";
import { queueNoticeTranslationCopies } from "@/lib/notice-translation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminConfigPayload = {
  backend_api_base_url?: string | null;
  backend_api_password?: string | null;
  ai_api_base_url?: string | null;
  ai_api_key?: string | null;
  ai_model?: string | null;
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

async function buildResponsePayload() {
  const config = await readAdminRuntimeConfig();

  return {
    backend_api_base_url: config.backend_api_base_url || "",
    backend_api_password: config.backend_api_password || "",
    ai_api_base_url: config.ai_api_base_url || "",
    ai_api_key: config.ai_api_key || "",
    ai_model: config.ai_model || "",
    extract_link_enabled: config.extract_link_enabled,
    subscription_enabled: config.subscription_enabled,
    overview_activity_window_minutes: config.overview_activity_window_minutes,
    notice_translation_system_prompt: config.notice_translation_system_prompt || "",
    notice_translation_user_prompt_template:
      config.notice_translation_user_prompt_template || "",
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
        ? normalizeBackendApiPassword(payload.backend_api_password)
        : undefined;
    const normalizedRequestedAiApiBaseUrl =
      typeof payload?.ai_api_base_url === "string"
        ? normalizeAiApiBaseUrl(payload.ai_api_base_url)
        : undefined;
    const normalizedRequestedAiApiKey =
      typeof payload?.ai_api_key === "string"
        ? normalizeAiApiKey(payload.ai_api_key)
        : undefined;
    const normalizedRequestedAiModel =
      typeof payload?.ai_model === "string"
        ? normalizeAiModel(payload.ai_model)
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
        : normalizeNoticeTranslationUserPromptTemplate(
            payload.notice_translation_user_prompt_template
          );

    await writeAdminRuntimeConfig({
      backend_api_base_url: normalizedRequestedBackendApiBaseUrl,
      backend_api_password: normalizedRequestedBackendApiPassword,
      ai_api_base_url: normalizedRequestedAiApiBaseUrl,
      ai_api_key: normalizedRequestedAiApiKey,
      ai_model: normalizedRequestedAiModel,
      extract_link_enabled: extractLinkEnabled,
      subscription_enabled: subscriptionEnabled,
      overview_activity_window_minutes: overviewActivityWindowMinutes,
      notice_translation_system_prompt: normalizedRequestedSystemPrompt,
      notice_translation_user_prompt_template: normalizedRequestedUserPromptTemplate,
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
    ai_api_base_url: null,
    ai_api_key: null,
    ai_model: null,
    extract_link_enabled: null,
    subscription_enabled: null,
    overview_activity_window_minutes: null,
    notice_translation_system_prompt: null,
    notice_translation_user_prompt_template: null,
  });
  return NextResponse.json(await buildResponsePayload());
}
