import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeNoticeTranslationSystemPrompt,
  normalizeNoticeTranslationUserPromptTemplate,
} from "@/lib/notice-translation-prompts";

export type AdminRuntimeConfig = {
  backend_api_base_url: string | null;
  backend_api_password: string | null;
  extract_link_enabled: boolean;
  subscription_enabled: boolean;
  overview_activity_window_minutes: number;
  notice_translation_system_prompt: string | null;
  notice_translation_user_prompt_template: string | null;
  updated_at: string | null;
};

const ADMIN_CONFIG_FILE = path.join(process.cwd(), "content", "admin-runtime-config.json");

export const DEFAULT_OVERVIEW_ACTIVITY_WINDOW_MINUTES = 1440;
const MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES = 1;
const MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES = 10080;

const DEFAULT_ADMIN_RUNTIME_CONFIG: AdminRuntimeConfig = {
  backend_api_base_url: null,
  backend_api_password: null,
  extract_link_enabled: true,
  subscription_enabled: true,
  overview_activity_window_minutes: DEFAULT_OVERVIEW_ACTIVITY_WINDOW_MINUTES,
  notice_translation_system_prompt: null,
  notice_translation_user_prompt_template: null,
  updated_at: null,
};

export function normalizeBackendApiBaseUrl(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Backend API URL must be a valid http:// or https:// address.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Backend API URL must start with http:// or https://.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeBackendApiPassword(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeRunModeEnabled(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeOverviewActivityWindowMinutes(
  value: unknown,
  fallback = DEFAULT_OVERVIEW_ACTIVITY_WINDOW_MINUTES
) {
  if (value == null || value === "") {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("Overview activity window must be a whole number of minutes.");
  }

  const minutes = Math.trunc(number);
  if (minutes < MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES || minutes > MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES) {
    throw new Error(
      `Overview activity window must be between ${MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES} and ${MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES} minutes.`
    );
  }

  return minutes;
}

function normalizeStoredOverviewActivityWindowMinutes(value: unknown) {
  try {
    return normalizeOverviewActivityWindowMinutes(value);
  } catch {
    return DEFAULT_ADMIN_RUNTIME_CONFIG.overview_activity_window_minutes;
  }
}

function normalizeStoredNoticeTranslationSystemPrompt(value: unknown) {
  return normalizeNoticeTranslationSystemPrompt(value);
}

function normalizeStoredNoticeTranslationUserPromptTemplate(value: unknown) {
  try {
    return normalizeNoticeTranslationUserPromptTemplate(value);
  } catch {
    return DEFAULT_ADMIN_RUNTIME_CONFIG.notice_translation_user_prompt_template;
  }
}

export async function readAdminRuntimeConfig(): Promise<AdminRuntimeConfig> {
  try {
    const raw = await readFile(ADMIN_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminRuntimeConfig>;
    return {
      backend_api_base_url: normalizeBackendApiBaseUrl(parsed.backend_api_base_url),
      backend_api_password: normalizeBackendApiPassword(parsed.backend_api_password),
      extract_link_enabled: normalizeRunModeEnabled(
        parsed.extract_link_enabled,
        DEFAULT_ADMIN_RUNTIME_CONFIG.extract_link_enabled
      ),
      subscription_enabled: normalizeRunModeEnabled(
        parsed.subscription_enabled,
        DEFAULT_ADMIN_RUNTIME_CONFIG.subscription_enabled
      ),
      overview_activity_window_minutes: normalizeStoredOverviewActivityWindowMinutes(
        parsed.overview_activity_window_minutes
      ),
      notice_translation_system_prompt: normalizeStoredNoticeTranslationSystemPrompt(
        parsed.notice_translation_system_prompt
      ),
      notice_translation_user_prompt_template: normalizeStoredNoticeTranslationUserPromptTemplate(
        parsed.notice_translation_user_prompt_template
      ),
      updated_at:
        typeof parsed.updated_at === "string" && parsed.updated_at.trim()
          ? parsed.updated_at
          : null,
    };
  } catch {
    return { ...DEFAULT_ADMIN_RUNTIME_CONFIG };
  }
}

export async function writeAdminRuntimeConfig(
  nextConfig: Partial<
    Pick<
      AdminRuntimeConfig,
      | "backend_api_base_url"
      | "backend_api_password"
      | "extract_link_enabled"
      | "subscription_enabled"
      | "overview_activity_window_minutes"
      | "notice_translation_system_prompt"
      | "notice_translation_user_prompt_template"
    >
  >
) {
  const currentConfig = await readAdminRuntimeConfig();
  const normalizedConfig: AdminRuntimeConfig = {
    backend_api_base_url:
      nextConfig.backend_api_base_url === undefined
        ? currentConfig.backend_api_base_url
        : normalizeBackendApiBaseUrl(nextConfig.backend_api_base_url),
    backend_api_password:
      nextConfig.backend_api_password === undefined
        ? currentConfig.backend_api_password
        : normalizeBackendApiPassword(nextConfig.backend_api_password),
    extract_link_enabled:
      nextConfig.extract_link_enabled === undefined
        ? currentConfig.extract_link_enabled
        : Boolean(nextConfig.extract_link_enabled),
    subscription_enabled:
      nextConfig.subscription_enabled === undefined
        ? currentConfig.subscription_enabled
        : Boolean(nextConfig.subscription_enabled),
    overview_activity_window_minutes:
      nextConfig.overview_activity_window_minutes === undefined
        ? currentConfig.overview_activity_window_minutes
        : normalizeOverviewActivityWindowMinutes(nextConfig.overview_activity_window_minutes),
    notice_translation_system_prompt:
      nextConfig.notice_translation_system_prompt === undefined
        ? currentConfig.notice_translation_system_prompt
        : normalizeNoticeTranslationSystemPrompt(nextConfig.notice_translation_system_prompt),
    notice_translation_user_prompt_template:
      nextConfig.notice_translation_user_prompt_template === undefined
        ? currentConfig.notice_translation_user_prompt_template
        : normalizeNoticeTranslationUserPromptTemplate(
            nextConfig.notice_translation_user_prompt_template
          ),
    updated_at: new Date().toISOString(),
  };

  await mkdir(path.dirname(ADMIN_CONFIG_FILE), { recursive: true });
  await writeFile(
    ADMIN_CONFIG_FILE,
    `${JSON.stringify(normalizedConfig, null, 2)}\n`,
    "utf8"
  );

  return normalizedConfig;
}
