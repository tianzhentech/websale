import "server-only";

import { readServerEnv } from "@/lib/server-env";
import {
  formatNormalizedAccountRecord,
  normalizeGmail,
  normalizePassword,
  normalizeTwofaSecret,
  splitBulkAccountInputLines,
  validateBulkAccountLine,
  type InvalidBulkAccountLine,
  type NormalizedAccountRecord,
} from "@/lib/account-format";

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

export type FormatConverterResult = {
  normalizedLines: string[];
  normalizedText: string;
  rawResponse: string[];
  invalidLines: Array<InvalidBulkAccountLine>;
  validLineCount: number;
};

const FORMATTER_API_BASE_URL_ENV = "PIXEL_WEBSALE_FORMATTER_API_BASE_URL";
const FORMATTER_API_KEY_ENV = "PIXEL_WEBSALE_FORMATTER_API_KEY";
const FORMATTER_MODEL_ENV = "PIXEL_WEBSALE_FORMATTER_MODEL";
const TRANSLATION_API_BASE_URL_ENV = "PIXEL_WEBSALE_TRANSLATION_API_BASE_URL";
const TRANSLATION_API_KEY_ENV = "PIXEL_WEBSALE_TRANSLATION_API_KEY";
const TRANSLATION_MODEL_ENV = "PIXEL_WEBSALE_TRANSLATION_MODEL";
const DEFAULT_API_BASE_URL = "https://api.zectai.com";
const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_FORMATTER_CONCURRENCY = 8;

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

function buildFormatConverterMessages(source: string, retryReason?: string) {
  const retryNote = retryReason
    ? `\n\nThe previous attempt was rejected by deterministic validation because: ${retryReason}. Return a corrected JSON object.`
    : "";

  return [
    {
      role: "system",
      content:
        "You normalize one noisy account line for an operations dashboard. Return JSON only, without markdown fences or explanations. The schema must be {\"gmail\":\"string\",\"password\":\"string\",\"twofa_secret\":\"string\"}. Rules: extract at most one Gmail account from this single line; ignore non-Gmail emails; preserve passwords exactly except trimming outer whitespace; if a TOTP otpauth URL is present, return only its secret value; if any field is missing, use an empty string; do not invent values.",
    },
    {
      role: "user",
      content: `Normalize this single account line:\n${source}${retryNote}`,
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

function parseSingleModelAccountRecord(payload: unknown): ModelAccountRecord | null {
  if (Array.isArray(payload)) {
    return (payload.find(isRecord) as ModelAccountRecord | undefined) || null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const accounts = payload.accounts;
  if (Array.isArray(accounts)) {
    return (accounts.find(isRecord) as ModelAccountRecord | undefined) || null;
  }

  return payload as ModelAccountRecord;
}

function normalizeRecordToLine(record: ModelAccountRecord | null) {
  const normalized = record ? normalizeAccountRecord(record) : null;
  return normalized ? formatNormalizedAccountRecord(normalized) : "";
}

function resolveIssueReason(code: InvalidBulkAccountLine["code"]) {
  switch (code) {
    case "missing_separator":
      return "the output must use Gmail---Password---2faSecret";
    case "missing_gmail":
      return "gmail is missing";
    case "invalid_gmail":
      return "gmail must be a valid @gmail.com address";
    case "missing_password":
      return "password is missing";
    case "missing_twofa":
      return "2FA secret is missing";
    case "invalid_twofa":
      return "2FA secret is invalid";
    default:
      return "the output did not pass validation";
  }
}

function resolveFormatterConcurrency() {
  const value = Number(process.env.PIXEL_WEBSALE_FORMATTER_CONCURRENCY || "");
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_FORMATTER_CONCURRENCY;
  }
  return Math.min(32, Math.max(1, Math.trunc(value)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  return results;
}

async function convertSingleLineThroughLlm(
  source: string,
  config: ReturnType<typeof resolveFormatterConfig>,
  retryReason?: string
) {
  const upstream = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      stream: false,
      messages: buildFormatConverterMessages(source, retryReason),
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
      normalizedLine: "",
      rawResponse: "",
    };
  }

  const parsedPayload = parseJsonPayload(rawResponse);
  const fallbackValidation = validateBulkAccountLine(rawResponse, 1);
  const normalizedLine =
    normalizeRecordToLine(parseSingleModelAccountRecord(parsedPayload)) ||
    (fallbackValidation.ok ? fallbackValidation.formatted : "");

  return {
    normalizedLine,
    rawResponse,
  };
}

async function convertSingleInputLine(
  sourceLine: { lineNumber: number; raw: string; trimmed: string },
  config: ReturnType<typeof resolveFormatterConfig>
) {
  const initialValidation = validateBulkAccountLine(sourceLine.trimmed, sourceLine.lineNumber);
  if (initialValidation.ok) {
    return {
      lineNumber: sourceLine.lineNumber,
      outputLine: initialValidation.formatted,
      valid: true,
      rawResponses: [] as string[],
      invalidLine: null as InvalidBulkAccountLine | null,
    };
  }

  const firstAttempt = await convertSingleLineThroughLlm(sourceLine.trimmed, config);
  const firstValidation = firstAttempt.normalizedLine
    ? validateBulkAccountLine(firstAttempt.normalizedLine, sourceLine.lineNumber)
    : {
        ok: false,
        code: initialValidation.code,
        lineNumber: sourceLine.lineNumber,
        raw: sourceLine.trimmed,
      } satisfies InvalidBulkAccountLine;

  if (firstValidation.ok) {
    return {
      lineNumber: sourceLine.lineNumber,
      outputLine: firstValidation.formatted,
      valid: true,
      rawResponses: firstAttempt.rawResponse ? [firstAttempt.rawResponse] : [],
      invalidLine: null as InvalidBulkAccountLine | null,
    };
  }

  const secondAttempt = await convertSingleLineThroughLlm(
    sourceLine.trimmed,
    config,
    resolveIssueReason(firstValidation.code)
  );
  const secondValidation = secondAttempt.normalizedLine
    ? validateBulkAccountLine(secondAttempt.normalizedLine, sourceLine.lineNumber)
    : firstValidation;

  if (secondValidation.ok) {
    return {
      lineNumber: sourceLine.lineNumber,
      outputLine: secondValidation.formatted,
      valid: true,
      rawResponses: [firstAttempt.rawResponse, secondAttempt.rawResponse].filter(Boolean),
      invalidLine: null as InvalidBulkAccountLine | null,
    };
  }

  return {
    lineNumber: sourceLine.lineNumber,
    outputLine: sourceLine.trimmed,
    valid: false,
    rawResponses: [firstAttempt.rawResponse, secondAttempt.rawResponse].filter(Boolean),
    invalidLine: secondValidation,
  };
}

export async function convertAccountFormat(source: string): Promise<FormatConverterResult> {
  const inputLines = splitBulkAccountInputLines(source);
  const nonEmptyLines = inputLines.filter((line) => !line.isEmpty);

  if (!nonEmptyLines.length) {
    return {
      normalizedLines: [],
      normalizedText: "",
      rawResponse: [],
      invalidLines: [],
      validLineCount: 0,
    };
  }

  const config = resolveFormatterConfig();
  const convertedLines = await mapWithConcurrency(
    nonEmptyLines,
    resolveFormatterConcurrency(),
    (line) => convertSingleInputLine(line, config)
  );
  const convertedByLineNumber = new Map(
    convertedLines.map((line) => [line.lineNumber, line] as const)
  );

  const normalizedLines = inputLines.map((line) => {
    if (line.isEmpty) {
      return "";
    }
    return convertedByLineNumber.get(line.lineNumber)?.outputLine || line.trimmed;
  });
  const invalidLines = convertedLines
    .map((line) => line.invalidLine)
    .filter((line): line is InvalidBulkAccountLine => Boolean(line));

  return {
    normalizedLines,
    normalizedText: normalizedLines.join("\n"),
    rawResponse: convertedLines.flatMap((line) => line.rawResponses),
    invalidLines,
    validLineCount: convertedLines.filter((line) => line.valid).length,
  };
}
