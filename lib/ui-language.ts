export const SUPPORTED_LANGUAGES = [
  {
    value: "zh",
    label: "中文",
    htmlLang: "zh-CN",
    locale: "zh-CN",
  },
  {
    value: "en",
    label: "English",
    htmlLang: "en",
    locale: "en-US",
  },
  {
    value: "vi",
    label: "Tiếng Việt",
    htmlLang: "vi",
    locale: "vi-VN",
  },
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number]["value"];

export const DEFAULT_LANGUAGE: Language = "zh";

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return SUPPORTED_LANGUAGES.some((language) => language.value === value);
}

export function resolvePreferredLanguage(value: string | null | undefined): Language {
  const normalized = (value || "").toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh";
  }
  if (normalized.startsWith("vi")) {
    return "vi";
  }

  return "en";
}

export function resolveHtmlLang(language: Language) {
  return SUPPORTED_LANGUAGES.find((item) => item.value === language)?.htmlLang || "en";
}

export function resolveLocale(language: Language) {
  return SUPPORTED_LANGUAGES.find((item) => item.value === language)?.locale || "en-US";
}
