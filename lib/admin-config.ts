import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AdminRuntimeConfig = {
  backend_api_base_url: string | null;
  backend_api_password: string | null;
  extract_link_enabled: boolean;
  subscription_enabled: boolean;
  updated_at: string | null;
};

const ADMIN_CONFIG_FILE = path.join(process.cwd(), "content", "admin-runtime-config.json");

const DEFAULT_ADMIN_RUNTIME_CONFIG: AdminRuntimeConfig = {
  backend_api_base_url: null,
  backend_api_password: null,
  extract_link_enabled: true,
  subscription_enabled: true,
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
