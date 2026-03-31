import "server-only";

import { readServerEnv } from "@/lib/server-env";

type JsonObject = Record<string, unknown>;

type ModelAccountRecord = {
  gmail?: unknown;
  email?: unknown;
  password?: unknown;
  twofa_secret?: unknown;
  twofa?: unknown;
  secret?: unknown;
  otp_url?: unknown;
  otpauth?: unknown;
};

type NormalizedAccountRecord = {
  gmail: string;
  password: string;
  twofaSecret: string;
};

export type FormatConverterResult = {
  normalizedLines: string[];
  normalizedText: string;
  rawResponse: string;
};

const FORMATTER_API_BASE_URL_ENV = "PIXEL_WEBSALE_FORMATTER_API_BASE_URL";
const FORMATTER_API_KEY_ENV = "PIXEL_WEBSALE_FORMATTER_API_KEY";
const FORMATTER_MODEL_ENV = "PIXEL_WEBSALE_FORMATTER_MODEL";
const TRANSLATION_API_BASE_URL_ENV = "PIXEL_WEBSALE_TRANSLATION_API_BASE_URL";
const TRANSLATION_API_KEY_ENV = "PIXEL_WEBSALE_TRANSLATION_API_KEY";
const TRANSLATION_MODEL_ENV = "PIXEL_WEBSALE_TRANSLATION_MODEL";
const DEFAULT_API_BASE_URL = "https://api.zectai.com";
const DEFAULT_MODEL = "gpt-5.2";

export const MAX_FORMAT_CONVERTER_INPUT_LENGTH = 20_000;

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveFormatterConfig() {
  const baseUrl = normalizeApiBaseUrl(
    readServerEnv(FORMATTER_API_BASE_URL_ENV) ||
      readServerEnv(TRANSLATION_API_BASE_URL_ENV) ||
      DEFAULT_API_BASE_URL
  );
  const apiKey =
    readServerEnv(FORMATTER_API_KEY_ENV) ||
    readServerEnv(TRANSLATION_API_KEY_ENV) ||
    "";
  const model =
    readServerEnv(FORMATTER_MODEL_ENV) ||
    readServerEnv(TRANSLATION_MODEL_ENV) ||
    DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("Format converter API key is not configured.");
  }

  return {
    apiKey,
    baseUrl,
    model,
  };
}

function buildFormatConverterMessages(source: string) {
  return [
    {
      role: "system",
      content:
        "You normalize noisy account data for an operations dashboard. Return JSON only, without markdown fences or explanations. The schema must be {\"accounts\":[{\"gmail\":\"string\",\"password\":\"string\",\"twofa_secret\":\"string\"}]}. Rules: extract every Gmail account you can identify; ignore non-Gmail emails; pair the closest password and 2FA secret with the correct Gmail; preserve passwords exactly except trimming outer whitespace; if a TOTP otpauth URL is present, return only its secret value; if password or 2FA secret is missing, return an empty string; do not invent values; deduplicate identical records.",
    },
    {
      role: "user",
      content: source,
    },
  ];
}

function parseFullCompletionResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return typeof choices?.[0]?.message?.content === "string" ? choices[0].message.content : "";
}

async function readUpstreamError(response: Response) {
  const fallback = `Format conversion request failed (HTTP ${response.status}).`;

  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      detail?: string;
    };
    return payload.error?.message || payload.detail || fallback;
  } catch {
    try {
      const text = await response.text();
      return text.trim() || fallback;
    } catch {
      return fallback;
    }
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith("`") && trimmed.endsWith("`")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeGmail(value: string) {
  const match = stripOuterQuotes(value).match(/[A-Z0-9._%+-]+@gmail\.com/gi);
  return match?.[0]?.toLowerCase() || "";
}

function normalizePassword(value: string) {
  return stripOuterQuotes(value);
}

function extractSecretFromOtpauthUrl(value: string) {
  const secretMatch = value.match(/[?&]secret=([^&]+)/i);
  if (!secretMatch?.[1]) {
    return "";
  }

  try {
    return decodeURIComponent(secretMatch[1]);
  } catch {
    return secretMatch[1];
  }
}

function normalizeTwofaSecret(value: string) {
  const trimmed = stripOuterQuotes(value);
  if (!trimmed) {
    return "";
  }

  const fromUrl =
    trimmed.includes("otpauth://") || trimmed.includes("secret=")
      ? extractSecretFromOtpauthUrl(trimmed)
      : "";
  const candidate = stripOuterQuotes(fromUrl || trimmed);
  const compact = candidate.replace(/[\s-]+/g, "");

  if (/^[A-Z2-7]+=*$/i.test(compact)) {
    return compact.toUpperCase();
  }

  return candidate;
}

function parseJsonPayload(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseModelAccountRecords(payload: unknown): ModelAccountRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const accounts = payload.accounts;
  if (!Array.isArray(accounts)) {
    return [];
  }

  return accounts.filter(isRecord);
}

function normalizeAccountRecord(record: ModelAccountRecord): NormalizedAccountRecord | null {
  const gmail = normalizeGmail(asText(record.gmail || record.email));
  if (!gmail) {
    return null;
  }

  return {
    gmail,
    password: normalizePassword(asText(record.password)),
    twofaSecret: normalizeTwofaSecret(
      asText(
        record.twofa_secret ||
          record.twofa ||
          record.secret ||
          record.otp_url ||
          record.otpauth
      )
    ),
  };
}

function cleanLine(line: string) {
  return line
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\d+[\).\s-]+/, "")
    .replace(/^[-*]\s+/, "")
    .trim();
}

function parseLineBasedRecords(text: string): NormalizedAccountRecord[] {
  const records: NormalizedAccountRecord[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) {
      continue;
    }

    const parts = line.split(/\s*---\s*/);
    if (parts.length < 3) {
      continue;
    }

    const gmail = normalizeGmail(parts[0] || "");
    if (!gmail) {
      continue;
    }

    records.push({
      gmail,
      password: normalizePassword(parts[1] || ""),
      twofaSecret: normalizeTwofaSecret(parts.slice(2).join("---")),
    });
  }

  return records;
}

function dedupeRecords(records: NormalizedAccountRecord[]) {
  const unique = new Map<string, NormalizedAccountRecord>();

  for (const record of records) {
    const key = `${record.gmail}\u0000${record.password}\u0000${record.twofaSecret}`;
    if (!unique.has(key)) {
      unique.set(key, record);
    }
  }

  return [...unique.values()];
}

function formatNormalizedLine(record: NormalizedAccountRecord) {
  return `${record.gmail}---${record.password}---${record.twofaSecret}`;
}

export async function convertAccountFormat(source: string): Promise<FormatConverterResult> {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    return {
      normalizedLines: [],
      normalizedText: "",
      rawResponse: "",
    };
  }

  const { apiKey, baseUrl, model } = resolveFormatterConfig();
  const upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      stream: false,
      messages: buildFormatConverterMessages(trimmedSource),
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    throw new Error(await readUpstreamError(upstream));
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;
  const rawResponse = parseFullCompletionResponse(payload).trim();
  if (!rawResponse) {
    return {
      normalizedLines: [],
      normalizedText: "",
      rawResponse: "",
    };
  }

  const parsedPayload = parseJsonPayload(rawResponse);
  const normalizedRecords = dedupeRecords(
    parseModelAccountRecords(parsedPayload)
      .map(normalizeAccountRecord)
      .filter((record): record is NormalizedAccountRecord => record !== null)
  );
  const fallbackRecords =
    normalizedRecords.length > 0 ? normalizedRecords : dedupeRecords(parseLineBasedRecords(rawResponse));
  const normalizedLines = fallbackRecords.map(formatNormalizedLine);

  return {
    normalizedLines,
    normalizedText: normalizedLines.join("\n"),
    rawResponse,
  };
}
