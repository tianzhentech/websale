"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";
import { SUPPORTED_LANGUAGES } from "@/lib/ui-language";

const COPY = {
  zh: {
    theme: "主题",
    language: "语言",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
  },
  en: {
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  vi: {
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
} as const;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function GlobalControls() {
  const { themePreference, setThemePreference, language, setLanguage } = useUiPreferences();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const copy = language === "zh" ? COPY.zh : language === "vi" ? COPY.vi : COPY.en;
  const currentLanguageLabel = useMemo(
    () => SUPPORTED_LANGUAGES.find((option) => option.value === language)?.label || language,
    [language]
  );

  useEffect(() => {
    if (!languageMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [languageMenuOpen]);

  return (
    <div className="control-bar">
      <div className="control-group">
        <span className="control-label">{copy.theme}</span>
        {([
          ["light", copy.light],
          ["dark", copy.dark],
          ["system", copy.system],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setThemePreference(value)}
            className={classNames(
              "control-chip",
              themePreference === value && "control-chip-active"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="control-group">
        <span className="control-label">{copy.language}</span>
        <div
          ref={languageMenuRef}
          className={classNames("control-dropdown", languageMenuOpen && "control-dropdown-open")}
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={languageMenuOpen}
            aria-label={copy.language}
            onClick={() => setLanguageMenuOpen((value) => !value)}
            className="control-dropdown-trigger"
          >
            <span>{currentLanguageLabel}</span>
            <span className={classNames("control-dropdown-caret", languageMenuOpen && "control-dropdown-caret-open")} />
          </button>

          {languageMenuOpen ? (
            <div className="control-dropdown-panel" role="listbox" aria-label={copy.language}>
              {SUPPORTED_LANGUAGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={language === option.value}
                  onClick={() => {
                    setLanguage(option.value);
                    setLanguageMenuOpen(false);
                  }}
                  className={classNames(
                    "control-dropdown-option",
                    language === option.value && "control-dropdown-option-active"
                  )}
                >
                  <span className="control-dropdown-option-check" aria-hidden="true">
                    {language === option.value ? "✓" : ""}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
