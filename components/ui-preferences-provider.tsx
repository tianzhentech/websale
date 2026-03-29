"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  resolveHtmlLang,
  resolvePreferredLanguage,
  type Language,
} from "@/lib/ui-language";

export type ThemePreference = "light" | "dark" | "system";
export type ThemeMode = "light" | "dark";
export type { Language } from "@/lib/ui-language";

const THEME_STORAGE_KEY = "pixel-websale-theme";
const LANGUAGE_STORAGE_KEY = "pixel-websale-language";

type UiPreferencesContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: ThemeMode;
  setThemePreference: (value: ThemePreference) => void;
  language: Language;
  setLanguage: (value: Language) => void;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function resolveTheme(preference: ThemePreference): ThemeMode {
  if (
    preference === "system" &&
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return preference === "dark" ? "dark" : "light";
}

function resolveLanguage(): Language {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(stored)) {
    return stored;
  }

  return resolvePreferredLanguage(window.navigator.language);
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>("light");
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      setThemePreference(storedTheme);
      setResolvedTheme(resolveTheme(storedTheme));
    } else {
      setResolvedTheme(resolveTheme("system"));
    }

    setLanguage(resolveLanguage());
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const nextResolvedTheme = resolveTheme(themePreference);
      setResolvedTheme(nextResolvedTheme);
      document.documentElement.dataset.theme = nextResolvedTheme;
      document.documentElement.dataset.themePreference = themePreference;
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    };

    applyTheme();

    if (themePreference !== "system") {
      return;
    }

    const handleChange = () => {
      applyTheme();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.lang = resolveHtmlLang(language);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
      language,
      setLanguage,
    }),
    [language, resolvedTheme, themePreference]
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  }
  return context;
}
