export const NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN = "{{targetLanguage}}";
export const NOTICE_TRANSLATION_CONTENT_TOKEN = "{{content}}";

export const DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT =
  "You are a translation engine for a Next.js app. Translate mixed Markdown and raw HTML faithfully. Preserve Markdown structure, headings, emphasis, lists, blockquotes, links, inline code, fenced code blocks, emojis, spacing, and line breaks. Preserve all HTML tags, attributes, class names, ids, inline styles, URLs, and nesting exactly as provided. Only translate user-visible natural-language text, including text nodes inside HTML elements. Do not translate code, URLs, email addresses, attribute names, CSS classes, ids, or inline JavaScript. Return translated content only, without code fences or explanations.";

export const DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE = `Translate the following Markdown/HTML content into ${NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN}. Keep both the Markdown structure and the HTML structure unchanged. If raw HTML is present, preserve every tag and attribute exactly and translate only the visible text content.\n\n${NOTICE_TRANSLATION_CONTENT_TOKEN}`;

function normalizePromptText(value: unknown) {
  const normalized = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  return normalized || null;
}

export function normalizeNoticeTranslationSystemPrompt(value: unknown) {
  return normalizePromptText(value);
}

export function normalizeNoticeTranslationUserPromptTemplate(value: unknown) {
  const normalized = normalizePromptText(value);
  if (!normalized) {
    return null;
  }

  if (!normalized.includes(NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN)) {
    throw new Error(
      `Translation user prompt template must include ${NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN}.`
    );
  }

  if (!normalized.includes(NOTICE_TRANSLATION_CONTENT_TOKEN)) {
    throw new Error(`Translation user prompt template must include ${NOTICE_TRANSLATION_CONTENT_TOKEN}.`);
  }

  return normalized;
}

export function resolveNoticeTranslationPrompts(config: {
  notice_translation_system_prompt?: string | null;
  notice_translation_user_prompt_template?: string | null;
}) {
  let userPromptTemplate = DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE;

  try {
    userPromptTemplate =
      normalizeNoticeTranslationUserPromptTemplate(config.notice_translation_user_prompt_template) ||
      DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE;
  } catch {
    userPromptTemplate = DEFAULT_NOTICE_TRANSLATION_USER_PROMPT_TEMPLATE;
  }

  return {
    systemPrompt:
      normalizeNoticeTranslationSystemPrompt(config.notice_translation_system_prompt) ||
      DEFAULT_NOTICE_TRANSLATION_SYSTEM_PROMPT,
    userPromptTemplate,
  };
}

export function fillNoticeTranslationUserPromptTemplate(
  template: string,
  targetLanguage: string,
  content: string
) {
  return template
    .split(NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN)
    .join(targetLanguage)
    .split(NOTICE_TRANSLATION_CONTENT_TOKEN)
    .join(content);
}
