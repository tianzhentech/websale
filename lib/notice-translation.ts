import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Language } from "@/lib/ui-language";
import {
  NOTICE_SOURCE_LANGUAGE,
  NOTICE_TRANSLATION_LANGUAGES,
  buildNoticeMarkdownDigest,
  normalizeNoticeMarkdown,
  readNoticeMarkdown,
  writeNoticeMarkdown,
  type NoticeLanguage,
  type NoticeTranslationLanguage,
} from "@/lib/notice-board";

type NoticePreparedContentStatus = "ready" | "pending" | "failed";

type NoticeTranslationManifestRecord = {
  error: string | null;
  sourceDigest: string;
  status: NoticePreparedContentStatus;
  updatedAt: string | null;
};

type NoticeTranslationManifest = {
  sourceDigest: string;
  sourceUpdatedAt: string;
  translations: Record<NoticeTranslationLanguage, NoticeTranslationManifestRecord>;
};

const TRANSLATION_API_BASE_URL_ENV = "PIXEL_WEBSALE_TRANSLATION_API_BASE_URL";
const TRANSLATION_API_KEY_ENV = "PIXEL_WEBSALE_TRANSLATION_API_KEY";
const TRANSLATION_MODEL_ENV = "PIXEL_WEBSALE_TRANSLATION_MODEL";
const DEFAULT_TRANSLATION_API_BASE_URL = "https://api.zectai.com";
const DEFAULT_TRANSLATION_MODEL = "gpt-5.2";
const NOTICE_TRANSLATION_MANIFEST_FILE = path.join(
  process.cwd(),
  "content",
  "notice-board.translation-state.json"
);

const translationCache = new Map<string, string>();
let translationQueue = Promise.resolve();
const queuedSourceDigests = new Set<string>();

function buildTranslationCacheKey(markdown: string, targetLanguage: NoticeTranslationLanguage) {
  return createHash("sha256")
    .update(`${targetLanguage}\n${normalizeNoticeMarkdown(markdown)}`)
    .digest("hex");
}

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveTranslationTargetLabel(language: NoticeTranslationLanguage) {
  if (language === "vi") {
    return "Vietnamese";
  }
  return "English";
}

function resolveTranslationConfig() {
  const baseUrl = normalizeApiBaseUrl(
    process.env[TRANSLATION_API_BASE_URL_ENV]?.trim() || DEFAULT_TRANSLATION_API_BASE_URL
  );
  const apiKey = process.env[TRANSLATION_API_KEY_ENV]?.trim() || "";
  const model = process.env[TRANSLATION_MODEL_ENV]?.trim() || DEFAULT_TRANSLATION_MODEL;

  if (!apiKey) {
    throw new Error("Translation API key is not configured.");
  }

  return {
    apiKey,
    baseUrl,
    model,
  };
}

function buildTranslationMessages(markdown: string, targetLanguage: NoticeTranslationLanguage) {
  const targetLabel = resolveTranslationTargetLabel(targetLanguage);

  return [
    {
      role: "system",
      content:
        "You are a translation engine for a Next.js app. Translate mixed Markdown and raw HTML faithfully. Preserve Markdown structure, headings, emphasis, lists, blockquotes, links, inline code, fenced code blocks, emojis, spacing, and line breaks. Preserve all HTML tags, attributes, class names, ids, inline styles, URLs, and nesting exactly as provided. Only translate user-visible natural-language text, including text nodes inside HTML elements. Do not translate code, URLs, email addresses, attribute names, CSS classes, ids, or inline JavaScript. Return translated content only, without code fences or explanations.",
    },
    {
      role: "user",
      content: `Translate the following Markdown/HTML content into ${targetLabel}. Keep both the Markdown structure and the HTML structure unchanged. If raw HTML is present, preserve every tag and attribute exactly and translate only the visible text content.\n\n${markdown}`,
    },
  ];
}

function parseFullTranslationResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return typeof choices?.[0]?.message?.content === "string" ? choices[0].message.content : "";
}

async function readUpstreamError(response: Response) {
  const fallback = `Translation request failed (HTTP ${response.status}).`;

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

function createManifestRecord(
  sourceDigest: string,
  status: NoticePreparedContentStatus,
  updatedAt: string | null = null,
  error: string | null = null
): NoticeTranslationManifestRecord {
  return {
    error,
    sourceDigest,
    status,
    updatedAt,
  };
}

function createTranslationManifest(
  sourceMarkdown: string,
  status: NoticePreparedContentStatus = "pending"
): NoticeTranslationManifest {
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);
  const sourceDigest = buildNoticeMarkdownDigest(normalizedSource);
  const sourceUpdatedAt = new Date().toISOString();

  return {
    sourceDigest,
    sourceUpdatedAt,
    translations: Object.fromEntries(
      NOTICE_TRANSLATION_LANGUAGES.map((language) => [
        language,
        createManifestRecord(sourceDigest, status, status === "ready" ? sourceUpdatedAt : null, null),
      ])
    ) as Record<NoticeTranslationLanguage, NoticeTranslationManifestRecord>,
  };
}

async function readTranslationManifestFile() {
  try {
    const content = await readFile(NOTICE_TRANSLATION_MANIFEST_FILE, "utf8");
    return JSON.parse(content) as NoticeTranslationManifest;
  } catch {
    return null;
  }
}

async function writeTranslationManifest(manifest: NoticeTranslationManifest) {
  await mkdir(path.dirname(NOTICE_TRANSLATION_MANIFEST_FILE), { recursive: true });
  await writeFile(
    NOTICE_TRANSLATION_MANIFEST_FILE,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function buildInitialTranslationManifest(sourceMarkdown: string) {
  const manifest = createTranslationManifest(sourceMarkdown, "pending");
  const sourceDigest = manifest.sourceDigest;
  const readyAt = new Date().toISOString();

  for (const language of NOTICE_TRANSLATION_LANGUAGES) {
    try {
      const translatedMarkdown = await readNoticeMarkdown(language);
      if (normalizeNoticeMarkdown(translatedMarkdown)) {
        manifest.translations[language] = createManifestRecord(sourceDigest, "ready", readyAt, null);
        translationCache.set(
          buildTranslationCacheKey(sourceMarkdown, language),
          translatedMarkdown
        );
      }
    } catch {
      manifest.translations[language] = createManifestRecord(sourceDigest, "pending", null, null);
    }
  }

  return manifest;
}

async function ensureTranslationManifest(sourceMarkdown: string) {
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);
  const sourceDigest = buildNoticeMarkdownDigest(normalizedSource);
  const existing = await readTranslationManifestFile();

  if (!existing) {
    const nextManifest = await buildInitialTranslationManifest(sourceMarkdown);
    await writeTranslationManifest(nextManifest);
    return nextManifest;
  }

  if (existing.sourceDigest === sourceDigest) {
    return existing;
  }

  const nextManifest = createTranslationManifest(sourceMarkdown, "pending");
  await writeTranslationManifest(nextManifest);
  return nextManifest;
}

async function updateTranslationManifestRecord(
  sourceDigest: string,
  language: NoticeTranslationLanguage,
  status: NoticePreparedContentStatus,
  error: string | null = null
) {
  const manifest = await readTranslationManifestFile();
  if (!manifest || manifest.sourceDigest !== sourceDigest) {
    return false;
  }

  manifest.translations[language] = createManifestRecord(
    sourceDigest,
    status,
    new Date().toISOString(),
    error
  );
  await writeTranslationManifest(manifest);
  return true;
}

async function isSourceDigestCurrent(sourceDigest: string) {
  const manifest = await readTranslationManifestFile();
  return manifest?.sourceDigest === sourceDigest;
}

export function getCachedNoticeTranslation(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage
) {
  return translationCache.get(buildTranslationCacheKey(markdown, targetLanguage)) || null;
}

export function cacheNoticeTranslation(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  translatedMarkdown: string
) {
  translationCache.set(
    buildTranslationCacheKey(markdown, targetLanguage),
    translatedMarkdown
  );
}

async function translateNoticeMarkdown(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage
) {
  const cached = getCachedNoticeTranslation(markdown, targetLanguage);
  if (cached !== null) {
    return cached;
  }

  const { apiKey, baseUrl, model } = resolveTranslationConfig();
  const upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      stream: false,
      messages: buildTranslationMessages(markdown, targetLanguage),
    }),
    cache: "no-store",
  });

  if (!upstream.ok) {
    throw new Error(await readUpstreamError(upstream));
  }

  const payload = (await upstream.json().catch(() => null)) as unknown;
  const translatedMarkdown = parseFullTranslationResponse(payload).trim();
  if (!translatedMarkdown) {
    throw new Error("Translated markdown is empty.");
  }

  const persistedTranslation = `${translatedMarkdown}\n`;
  cacheNoticeTranslation(markdown, targetLanguage, persistedTranslation);
  return persistedTranslation;
}

async function runQueuedTranslationCopies(sourceMarkdown: string) {
  const sourceDigest = buildNoticeMarkdownDigest(sourceMarkdown);

  for (const language of NOTICE_TRANSLATION_LANGUAGES) {
    if (!(await isSourceDigestCurrent(sourceDigest))) {
      return;
    }

    try {
      const translatedMarkdown = await translateNoticeMarkdown(sourceMarkdown, language);
      if (!(await isSourceDigestCurrent(sourceDigest))) {
        return;
      }

      await writeNoticeMarkdown(language, translatedMarkdown);
      await updateTranslationManifestRecord(sourceDigest, language, "ready", null);
      cacheNoticeTranslation(sourceMarkdown, language, translatedMarkdown);
    } catch (error) {
      if (!(await isSourceDigestCurrent(sourceDigest))) {
        return;
      }

      const detail = error instanceof Error && error.message ? error.message : "Unexpected translation error.";
      await updateTranslationManifestRecord(sourceDigest, language, "failed", detail);
    }
  }
}

export async function queueNoticeTranslationCopies(sourceMarkdown: string) {
  const manifest = await ensureTranslationManifest(sourceMarkdown);
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);

  if (!normalizedSource) {
    for (const language of NOTICE_TRANSLATION_LANGUAGES) {
      await writeNoticeMarkdown(language, "");
      manifest.translations[language] = createManifestRecord(manifest.sourceDigest, "ready", new Date().toISOString(), null);
      cacheNoticeTranslation(sourceMarkdown, language, "");
    }
    await writeTranslationManifest(manifest);
    return {
      queued: false,
      sourceDigest: manifest.sourceDigest,
    };
  }

  const needsWork = NOTICE_TRANSLATION_LANGUAGES.some(
    (language) => manifest.translations[language].status !== "ready"
  );

  if (!needsWork) {
    return {
      queued: false,
      sourceDigest: manifest.sourceDigest,
    };
  }

  if (queuedSourceDigests.has(manifest.sourceDigest)) {
    return {
      queued: true,
      sourceDigest: manifest.sourceDigest,
    };
  }

  queuedSourceDigests.add(manifest.sourceDigest);
  translationQueue = translationQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await runQueuedTranslationCopies(sourceMarkdown);
      } finally {
        queuedSourceDigests.delete(manifest.sourceDigest);
      }
    });

  return {
    queued: true,
    sourceDigest: manifest.sourceDigest,
  };
}

export async function readPreparedNoticeMarkdown(targetLanguage: Language) {
  const sourceMarkdown = await readNoticeMarkdown(NOTICE_SOURCE_LANGUAGE);

  if (targetLanguage === NOTICE_SOURCE_LANGUAGE) {
    return {
      contentLanguage: NOTICE_SOURCE_LANGUAGE as NoticeLanguage,
      markdown: sourceMarkdown,
      status: "ready" as const,
    };
  }

  const translationLanguage = targetLanguage as NoticeTranslationLanguage;
  const manifest = await ensureTranslationManifest(sourceMarkdown);
  const translationState = manifest.translations[translationLanguage];

  if (translationState?.status === "ready" && translationState.sourceDigest === manifest.sourceDigest) {
    const translatedMarkdown = await readNoticeMarkdown(translationLanguage);
    cacheNoticeTranslation(sourceMarkdown, translationLanguage, translatedMarkdown);
    return {
      contentLanguage: translationLanguage as NoticeLanguage,
      markdown: translatedMarkdown,
      status: "ready" as const,
    };
  }

  void queueNoticeTranslationCopies(sourceMarkdown);
  return {
    contentLanguage: NOTICE_SOURCE_LANGUAGE as NoticeLanguage,
    markdown: sourceMarkdown,
    status: translationState?.status || ("pending" as const),
  };
}

export function createBufferedNoticeStream(text: string, chunkSize = 192) {
  const encoder = new TextEncoder();
  const chunks = text.match(new RegExp(`.{1,${chunkSize}}`, "gs")) || [text];

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
