import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readAdminRuntimeConfig, resolveAdminAiConfig } from "@/lib/admin-config";
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
import {
  fillNoticeTranslationUserPromptTemplate,
  resolveNoticeTranslationPrompts,
} from "@/lib/notice-translation-prompts";

type NoticePreparedContentStatus = "ready" | "pending" | "failed";

type NoticeTranslationManifestRecord = {
  error: string | null;
  sourceDigest: string;
  status: NoticePreparedContentStatus;
  updatedAt: string | null;
};

type NoticeTranslationManifest = {
  promptDigest: string;
  sourceDigest: string;
  sourceUpdatedAt: string;
  translations: Record<NoticeTranslationLanguage, NoticeTranslationManifestRecord>;
};

type ActiveNoticeTranslationPrompts = {
  promptDigest: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

const NOTICE_TRANSLATION_MANIFEST_FILE = path.join(
  process.cwd(),
  "content",
  "notice-board.translation-state.json"
);

const translationCache = new Map<string, string>();
let translationQueue = Promise.resolve();
const queuedTranslationKeys = new Set<string>();

function buildNoticeTranslationPromptDigest(systemPrompt: string, userPromptTemplate: string) {
  return createHash("sha256")
    .update(`${systemPrompt}\n---\n${userPromptTemplate}`)
    .digest("hex");
}

function buildTranslationQueueKey(sourceDigest: string, promptDigest: string) {
  return `${sourceDigest}:${promptDigest}`;
}

function buildTranslationCacheKey(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  promptDigest: string
) {
  return createHash("sha256")
    .update(`${targetLanguage}\n${promptDigest}\n${normalizeNoticeMarkdown(markdown)}`)
    .digest("hex");
}

function resolveTranslationTargetLabel(language: NoticeTranslationLanguage) {
  if (language === "vi") {
    return "Vietnamese";
  }
  return "English";
}

async function resolveActiveNoticeTranslationPrompts(): Promise<ActiveNoticeTranslationPrompts> {
  const config = await readAdminRuntimeConfig();
  const prompts = resolveNoticeTranslationPrompts(config);

  return {
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
    promptDigest: buildNoticeTranslationPromptDigest(
      prompts.systemPrompt,
      prompts.userPromptTemplate
    ),
  };
}

type TranslationRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

async function resolveTranslationConfig(): Promise<TranslationRuntimeConfig> {
  const config = await resolveAdminAiConfig();

  if (!config.apiKey) {
    throw new Error("Translation API key is not configured.");
  }

  return config;
}

function buildTranslationMessages(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  prompts: Pick<ActiveNoticeTranslationPrompts, "systemPrompt" | "userPromptTemplate">
) {
  const targetLabel = resolveTranslationTargetLabel(targetLanguage);

  return [
    {
      role: "system",
      content: prompts.systemPrompt,
    },
    {
      role: "user",
      content: fillNoticeTranslationUserPromptTemplate(
        prompts.userPromptTemplate,
        targetLabel,
        markdown
      ),
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
  promptDigest: string,
  status: NoticePreparedContentStatus = "pending"
): NoticeTranslationManifest {
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);
  const sourceDigest = buildNoticeMarkdownDigest(normalizedSource);
  const sourceUpdatedAt = new Date().toISOString();

  return {
    promptDigest,
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

async function buildInitialTranslationManifest(sourceMarkdown: string, promptDigest: string) {
  const manifest = createTranslationManifest(sourceMarkdown, promptDigest, "pending");
  const sourceDigest = manifest.sourceDigest;
  const readyAt = new Date().toISOString();

  for (const language of NOTICE_TRANSLATION_LANGUAGES) {
    try {
      const translatedMarkdown = await readNoticeMarkdown(language);
      if (normalizeNoticeMarkdown(translatedMarkdown)) {
        manifest.translations[language] = createManifestRecord(sourceDigest, "ready", readyAt, null);
        translationCache.set(
          buildTranslationCacheKey(sourceMarkdown, language, promptDigest),
          translatedMarkdown
        );
      }
    } catch {
      manifest.translations[language] = createManifestRecord(sourceDigest, "pending", null, null);
    }
  }

  return manifest;
}

async function ensureTranslationManifest(sourceMarkdown: string, promptDigest: string) {
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);
  const sourceDigest = buildNoticeMarkdownDigest(normalizedSource);
  const existing = await readTranslationManifestFile();

  if (!existing) {
    const nextManifest = await buildInitialTranslationManifest(sourceMarkdown, promptDigest);
    await writeTranslationManifest(nextManifest);
    return nextManifest;
  }

  if (existing.sourceDigest === sourceDigest && existing.promptDigest === promptDigest) {
    return existing;
  }

  const nextManifest = createTranslationManifest(sourceMarkdown, promptDigest, "pending");
  await writeTranslationManifest(nextManifest);
  return nextManifest;
}

async function updateTranslationManifestRecord(
  sourceDigest: string,
  promptDigest: string,
  language: NoticeTranslationLanguage,
  status: NoticePreparedContentStatus,
  error: string | null = null
) {
  const manifest = await readTranslationManifestFile();
  if (
    !manifest ||
    manifest.sourceDigest !== sourceDigest ||
    manifest.promptDigest !== promptDigest
  ) {
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

async function isTranslationStateCurrent(sourceDigest: string, promptDigest: string) {
  const manifest = await readTranslationManifestFile();
  return (
    manifest?.sourceDigest === sourceDigest && manifest?.promptDigest === promptDigest
  );
}

export function getCachedNoticeTranslation(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  promptDigest: string
) {
  return translationCache.get(buildTranslationCacheKey(markdown, targetLanguage, promptDigest)) || null;
}

export function cacheNoticeTranslation(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  translatedMarkdown: string,
  promptDigest: string
) {
  translationCache.set(
    buildTranslationCacheKey(markdown, targetLanguage, promptDigest),
    translatedMarkdown
  );
}

async function translateNoticeMarkdown(
  markdown: string,
  targetLanguage: NoticeTranslationLanguage,
  prompts: ActiveNoticeTranslationPrompts
) {
  const cached = getCachedNoticeTranslation(markdown, targetLanguage, prompts.promptDigest);
  if (cached !== null) {
    return cached;
  }

  const { apiKey, baseUrl, model } = await resolveTranslationConfig();
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
      messages: buildTranslationMessages(markdown, targetLanguage, prompts),
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
  cacheNoticeTranslation(markdown, targetLanguage, persistedTranslation, prompts.promptDigest);
  return persistedTranslation;
}

async function runQueuedTranslationCopies(
  sourceMarkdown: string,
  prompts: ActiveNoticeTranslationPrompts
) {
  const sourceDigest = buildNoticeMarkdownDigest(sourceMarkdown);
  const promptDigest = prompts.promptDigest;

  for (const language of NOTICE_TRANSLATION_LANGUAGES) {
    if (!(await isTranslationStateCurrent(sourceDigest, promptDigest))) {
      return;
    }

    try {
      const translatedMarkdown = await translateNoticeMarkdown(sourceMarkdown, language, prompts);
      if (!(await isTranslationStateCurrent(sourceDigest, promptDigest))) {
        return;
      }

      await writeNoticeMarkdown(language, translatedMarkdown);
      await updateTranslationManifestRecord(sourceDigest, promptDigest, language, "ready", null);
      cacheNoticeTranslation(sourceMarkdown, language, translatedMarkdown, promptDigest);
    } catch (error) {
      if (!(await isTranslationStateCurrent(sourceDigest, promptDigest))) {
        return;
      }

      const detail = error instanceof Error && error.message ? error.message : "Unexpected translation error.";
      await updateTranslationManifestRecord(sourceDigest, promptDigest, language, "failed", detail);
    }
  }
}

export async function queueNoticeTranslationCopies(sourceMarkdown: string) {
  const prompts = await resolveActiveNoticeTranslationPrompts();
  const manifest = await ensureTranslationManifest(sourceMarkdown, prompts.promptDigest);
  const normalizedSource = normalizeNoticeMarkdown(sourceMarkdown);

  if (!normalizedSource) {
    for (const language of NOTICE_TRANSLATION_LANGUAGES) {
      await writeNoticeMarkdown(language, "");
      manifest.translations[language] = createManifestRecord(manifest.sourceDigest, "ready", new Date().toISOString(), null);
      cacheNoticeTranslation(sourceMarkdown, language, "", prompts.promptDigest);
    }
    await writeTranslationManifest(manifest);
    return {
      queued: false,
      promptDigest: manifest.promptDigest,
      sourceDigest: manifest.sourceDigest,
    };
  }

  const needsWork = NOTICE_TRANSLATION_LANGUAGES.some(
    (language) => manifest.translations[language].status !== "ready"
  );

  if (!needsWork) {
    return {
      queued: false,
      promptDigest: manifest.promptDigest,
      sourceDigest: manifest.sourceDigest,
    };
  }

  const queueKey = buildTranslationQueueKey(manifest.sourceDigest, manifest.promptDigest);

  if (queuedTranslationKeys.has(queueKey)) {
    return {
      queued: true,
      promptDigest: manifest.promptDigest,
      sourceDigest: manifest.sourceDigest,
    };
  }

  queuedTranslationKeys.add(queueKey);
  translationQueue = translationQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await runQueuedTranslationCopies(sourceMarkdown, prompts);
      } finally {
        queuedTranslationKeys.delete(queueKey);
      }
    });

  return {
    queued: true,
    promptDigest: manifest.promptDigest,
    sourceDigest: manifest.sourceDigest,
  };
}

export async function readPreparedNoticeMarkdown(targetLanguage: Language) {
  const sourceMarkdown = await readNoticeMarkdown(NOTICE_SOURCE_LANGUAGE);
  const prompts = await resolveActiveNoticeTranslationPrompts();

  if (targetLanguage === NOTICE_SOURCE_LANGUAGE) {
    return {
      contentLanguage: NOTICE_SOURCE_LANGUAGE as NoticeLanguage,
      markdown: sourceMarkdown,
      status: "ready" as const,
    };
  }

  const translationLanguage = targetLanguage as NoticeTranslationLanguage;
  const manifest = await ensureTranslationManifest(sourceMarkdown, prompts.promptDigest);
  const translationState = manifest.translations[translationLanguage];

  if (translationState?.status === "ready" && translationState.sourceDigest === manifest.sourceDigest) {
    const translatedMarkdown = await readNoticeMarkdown(translationLanguage);
    cacheNoticeTranslation(sourceMarkdown, translationLanguage, translatedMarkdown, prompts.promptDigest);
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
