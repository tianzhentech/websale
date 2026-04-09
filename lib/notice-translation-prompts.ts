export const NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN = "{{targetLanguage}}";
export const NOTICE_TRANSLATION_CONTENT_TOKEN = "{{content}}";

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
  const systemPrompt = normalizeNoticeTranslationSystemPrompt(
    config.notice_translation_system_prompt
  );
  if (!systemPrompt) {
    throw new Error("Notice translation system prompt is not configured in .env.local.");
  }

  const userPromptTemplate = normalizeNoticeTranslationUserPromptTemplate(
    config.notice_translation_user_prompt_template
  );
  if (!userPromptTemplate) {
    throw new Error(
      "Notice translation user prompt template is not configured in .env.local."
    );
  }

  return {
    systemPrompt,
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
