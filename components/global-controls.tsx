"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";
import { SUPPORTED_LANGUAGES } from "@/lib/ui-language";

const COPY = {
  zh: {
    notice: "提示",
    show: "打开",
    hide: "关闭",
    theme: "主题",
    language: "语言",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
  },
  en: {
    notice: "Notice",
    show: "On",
    hide: "Off",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  vi: {
    notice: "Notice",
    show: "On",
    hide: "Off",
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
  const {
    themePreference,
    setThemePreference,
    language,
    setLanguage,
    noticeVisible,
    setNoticeVisible,
  } = useUiPreferences();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const copy = language === "zh" ? COPY.zh : language === "vi" ? COPY.vi : COPY.en;
  const noticeOptions = [
    [true, copy.show],
    [false, copy.hide],
  ] as const;
  const activeNoticeIndex = noticeOptions.findIndex(([value]) => value === noticeVisible);
  const themeOptions = [
    ["light", copy.light],
    ["dark", copy.dark],
    ["system", copy.system],
  ] as const;
  const activeThemeIndex = themeOptions.findIndex(([value]) => value === themePreference);
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
        <span className="control-label">{copy.notice}</span>
        <div className="surface-card relative grid h-[2.4rem] min-w-[8.8rem] grid-cols-2 rounded-full border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.74)] p-[2px]">
          <span
            aria-hidden="true"
            className="segmented-control-indicator pointer-events-none absolute bottom-[2px] left-[2px] top-[2px] rounded-full transition-transform duration-300 ease-out"
            style={{
              width: "calc((100% - 4px) / 2)",
              transform: `translateX(${Math.max(0, activeNoticeIndex) * 100}%)`,
            }}
          />
          {noticeOptions.map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setNoticeVisible(value)}
              className={classNames(
                "relative z-10 h-full rounded-full px-3 text-[0.84rem] font-semibold leading-none transition-colors duration-300",
                noticeVisible === value
                  ? "segmented-control-button-active"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">{copy.theme}</span>
        <div className="surface-card relative grid h-[2.4rem] min-w-[16.75rem] grid-cols-3 rounded-full border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.74)] p-[2px]">
          <span
            aria-hidden="true"
            className="segmented-control-indicator pointer-events-none absolute bottom-[2px] left-[2px] top-[2px] rounded-full transition-transform duration-300 ease-out"
            style={{
              width: "calc((100% - 4px) / 3)",
              transform: `translateX(${Math.max(0, activeThemeIndex) * 100}%)`,
            }}
          />
          {themeOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setThemePreference(value)}
              className={classNames(
                "relative z-10 h-full rounded-full px-3 text-[0.84rem] font-semibold leading-none transition-colors duration-300",
                themePreference === value
                  ? "segmented-control-button-active"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
