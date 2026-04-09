import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeNoticeTranslationSystemPrompt,
  normalizeNoticeTranslationUserPromptTemplate,
} from "@/lib/notice-translation-prompts";
import { readLocalEnvValue, writeLocalEnvValues } from "@/lib/server-env";

export type AdminRuntimeConfig = {
  backend_api_base_url: string | null;
  backend_api_password: string | null;
  ai_api_base_url: string | null;
  ai_api_key: string | null;
  ai_model: string | null;
  extract_link_enabled: boolean | null;
  subscription_enabled: boolean | null;
  overview_activity_window_minutes: number | null;
  notice_translation_system_prompt: string | null;
  notice_translation_user_prompt_template: string | null;
  updated_at: string | null;
};

type AdminConfigMetadata = {
  updated_at: string | null;
};

const ADMIN_CONFIG_FILE = path.join(process.cwd(), "content", "admin-runtime-config.json");
const MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES = 1;
const MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES = 10080;
const BACKEND_API_BASE_URL_ENV = "PIXEL_WEBSALE_API_BASE_URL";
const BACKEND_API_PASSWORD_ENV = "PIXEL_WEBSALE_API_PASSWORD";
const AI_API_BASE_URL_ENV = "PIXEL_WEBSALE_TRANSLATION_API_BASE_URL";
const AI_API_KEY_ENV = "PIXEL_WEBSALE_TRANSLATION_API_KEY";
const AI_MODEL_ENV = "PIXEL_WEBSALE_TRANSLATION_MODEL";
const EXTRACT_LINK_ENABLED_ENV = "PIXEL_WEBSALE_EXTRACT_LINK_ENABLED";
const SUBSCRIPTION_ENABLED_ENV = "PIXEL_WEBSALE_SUBSCRIPTION_ENABLED";
const OVERVIEW_ACTIVITY_WINDOW_ENV = "PIXEL_WEBSALE_OVERVIEW_ACTIVITY_WINDOW_MINUTES";
const NOTICE_TRANSLATION_SYSTEM_PROMPT_ENV =
  "PIXEL_WEBSALE_NOTICE_TRANSLATION_SYSTEM_PROMPT";
const NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE_ENV =
  "PIXEL_WEBSALE_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE";

const DEFAULT_ADMIN_RUNTIME_CONFIG: AdminRuntimeConfig = {
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
  updated_at: null,
};

function normalizeHttpBaseUrl(value: string | null | undefined, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid http:// or https:// address.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must start with http:// or https://.`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

function normalizeOptionalBooleanString(
  value: string | null | undefined,
  label: string
): boolean | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${label} must be true or false.`);
}

export function normalizeBackendApiBaseUrl(value: string | null | undefined) {
  return normalizeHttpBaseUrl(value, "Backend API URL");
}

export function normalizeBackendApiPassword(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeAiApiBaseUrl(value: string | null | undefined) {
  return normalizeHttpBaseUrl(value, "AI base URL");
}

export function normalizeAiApiKey(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeAiModel(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeOverviewActivityWindowMinutes(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("Overview activity window must be a whole number of minutes.");
  }

  const minutes = Math.trunc(number);
  if (
    minutes < MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES ||
    minutes > MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES
  ) {
    throw new Error(
      `Overview activity window must be between ${MIN_OVERVIEW_ACTIVITY_WINDOW_MINUTES} and ${MAX_OVERVIEW_ACTIVITY_WINDOW_MINUTES} minutes.`
    );
  }

  return minutes;
}

async function readAdminConfigMetadata(): Promise<AdminConfigMetadata> {
  try {
    const raw = await readFile(ADMIN_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminConfigMetadata>;

    return {
      updated_at:
        typeof parsed.updated_at === "string" && parsed.updated_at.trim()
          ? parsed.updated_at
          : null,
    };
  } catch {
    return { updated_at: null };
  }
}

async function writeAdminConfigMetadata(updatedAt: string) {
  await mkdir(path.dirname(ADMIN_CONFIG_FILE), { recursive: true });
  await writeFile(
    ADMIN_CONFIG_FILE,
    `${JSON.stringify({ updated_at: updatedAt }, null, 2)}\n`,
    "utf8"
  );
}

function readRequiredAdminPromptValue(name: string) {
  const rawValue = readLocalEnvValue(name);
  return rawValue == null ? null : rawValue;
}

export async function resolveAdminAiConfig() {
  const config = await readAdminRuntimeConfig();
  const baseUrl = config.ai_api_base_url;
  const apiKey = config.ai_api_key;
  const model = config.ai_model;

  if (!baseUrl) {
    throw new Error("AI base URL is not configured in .env.local.");
  }

  if (!apiKey) {
    throw new Error("AI API key is not configured in .env.local.");
  }

  if (!model) {
    throw new Error("AI model is not configured in .env.local.");
  }

  return { baseUrl, apiKey, model };
}

export async function readAdminRuntimeConfig(): Promise<AdminRuntimeConfig> {
  const metadata = await readAdminConfigMetadata();

  return {
    backend_api_base_url: normalizeBackendApiBaseUrl(
      readLocalEnvValue(BACKEND_API_BASE_URL_ENV)
    ),
    backend_api_password: normalizeBackendApiPassword(
      readLocalEnvValue(BACKEND_API_PASSWORD_ENV)
    ),
    ai_api_base_url: normalizeAiApiBaseUrl(readLocalEnvValue(AI_API_BASE_URL_ENV)),
    ai_api_key: normalizeAiApiKey(readLocalEnvValue(AI_API_KEY_ENV)),
    ai_model: normalizeAiModel(readLocalEnvValue(AI_MODEL_ENV)),
    extract_link_enabled: normalizeOptionalBooleanString(
      readLocalEnvValue(EXTRACT_LINK_ENABLED_ENV),
      "Extract link mode switch"
    ),
    subscription_enabled: normalizeOptionalBooleanString(
      readLocalEnvValue(SUBSCRIPTION_ENABLED_ENV),
      "Subscription mode switch"
    ),
    overview_activity_window_minutes: normalizeOverviewActivityWindowMinutes(
      readLocalEnvValue(OVERVIEW_ACTIVITY_WINDOW_ENV)
    ),
    notice_translation_system_prompt: normalizeNoticeTranslationSystemPrompt(
      readRequiredAdminPromptValue(NOTICE_TRANSLATION_SYSTEM_PROMPT_ENV)
    ),
    notice_translation_user_prompt_template:
      normalizeNoticeTranslationUserPromptTemplate(
        readRequiredAdminPromptValue(NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE_ENV)
      ),
    updated_at: metadata.updated_at,
  };
}

export async function writeAdminRuntimeConfig(
  nextConfig: Partial<
    Pick<
      AdminRuntimeConfig,
      | "backend_api_base_url"
      | "backend_api_password"
      | "ai_api_base_url"
      | "ai_api_key"
      | "ai_model"
      | "extract_link_enabled"
      | "subscription_enabled"
      | "overview_activity_window_minutes"
      | "notice_translation_system_prompt"
      | "notice_translation_user_prompt_template"
    >
  >
) {
  const currentConfig = await readAdminRuntimeConfig().catch(
    () => ({ ...DEFAULT_ADMIN_RUNTIME_CONFIG })
  );
  const normalizedConfig: AdminRuntimeConfig = {
    backend_api_base_url:
      nextConfig.backend_api_base_url === undefined
        ? currentConfig.backend_api_base_url
        : normalizeBackendApiBaseUrl(nextConfig.backend_api_base_url),
    backend_api_password:
      nextConfig.backend_api_password === undefined
        ? currentConfig.backend_api_password
        : normalizeBackendApiPassword(nextConfig.backend_api_password),
    ai_api_base_url:
      nextConfig.ai_api_base_url === undefined
        ? currentConfig.ai_api_base_url
        : normalizeAiApiBaseUrl(nextConfig.ai_api_base_url),
    ai_api_key:
      nextConfig.ai_api_key === undefined
        ? currentConfig.ai_api_key
        : normalizeAiApiKey(nextConfig.ai_api_key),
    ai_model:
      nextConfig.ai_model === undefined
        ? currentConfig.ai_model
        : normalizeAiModel(nextConfig.ai_model),
    extract_link_enabled:
      nextConfig.extract_link_enabled === undefined
        ? currentConfig.extract_link_enabled
        : nextConfig.extract_link_enabled,
    subscription_enabled:
      nextConfig.subscription_enabled === undefined
        ? currentConfig.subscription_enabled
        : nextConfig.subscription_enabled,
    overview_activity_window_minutes:
      nextConfig.overview_activity_window_minutes === undefined
        ? currentConfig.overview_activity_window_minutes
        : normalizeOverviewActivityWindowMinutes(
            nextConfig.overview_activity_window_minutes
          ),
    notice_translation_system_prompt:
      nextConfig.notice_translation_system_prompt === undefined
        ? currentConfig.notice_translation_system_prompt
        : normalizeNoticeTranslationSystemPrompt(
            nextConfig.notice_translation_system_prompt
          ),
    notice_translation_user_prompt_template:
      nextConfig.notice_translation_user_prompt_template === undefined
        ? currentConfig.notice_translation_user_prompt_template
        : normalizeNoticeTranslationUserPromptTemplate(
            nextConfig.notice_translation_user_prompt_template
          ),
    updated_at: new Date().toISOString(),
  };

  await writeLocalEnvValues({
    [BACKEND_API_BASE_URL_ENV]: normalizedConfig.backend_api_base_url,
    [BACKEND_API_PASSWORD_ENV]: normalizedConfig.backend_api_password,
    [AI_API_BASE_URL_ENV]: normalizedConfig.ai_api_base_url,
    [AI_API_KEY_ENV]: normalizedConfig.ai_api_key,
    [AI_MODEL_ENV]: normalizedConfig.ai_model,
    [EXTRACT_LINK_ENABLED_ENV]:
      normalizedConfig.extract_link_enabled == null
        ? null
        : String(normalizedConfig.extract_link_enabled),
    [SUBSCRIPTION_ENABLED_ENV]:
      normalizedConfig.subscription_enabled == null
        ? null
        : String(normalizedConfig.subscription_enabled),
    [OVERVIEW_ACTIVITY_WINDOW_ENV]:
      normalizedConfig.overview_activity_window_minutes == null
        ? null
        : String(normalizedConfig.overview_activity_window_minutes),
    [NOTICE_TRANSLATION_SYSTEM_PROMPT_ENV]:
      normalizedConfig.notice_translation_system_prompt,
    [NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE_ENV]:
      normalizedConfig.notice_translation_user_prompt_template,
  });

  await writeAdminConfigMetadata(normalizedConfig.updated_at || new Date().toISOString());
  return normalizedConfig;
}
