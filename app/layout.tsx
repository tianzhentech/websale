import type { Metadata } from "next";

import { UiPreferencesProvider } from "@/components/ui-preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pixel CDK Exchange",
  description: "Redeem Pixel CDKs for extract-link and subscription plans.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hydrationScript = `
    (function () {
      try {
        var themeKey = "pixel-websale-theme";
        var languageKey = "pixel-websale-language";
        var themePreference = localStorage.getItem(themeKey) || "dark";
        var storedLanguage = localStorage.getItem(languageKey);
        var preferredLanguage = storedLanguage || navigator.language.toLowerCase();
        var language = preferredLanguage.indexOf("zh") === 0
          ? "zh"
          : preferredLanguage.indexOf("vi") === 0
            ? "vi"
            : "en";
        var resolvedTheme = themePreference === "system"
          ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : themePreference;

        document.documentElement.dataset.theme = resolvedTheme;
        document.documentElement.dataset.themePreference = themePreference;
        document.documentElement.lang = language === "zh" ? "zh-CN" : language === "vi" ? "vi" : "en";
      } catch (error) {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.dataset.themePreference = "dark";
        document.documentElement.lang = "zh-CN";
      }
    })();
  `;

  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      data-theme-preference="dark"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: hydrationScript }} />
        <UiPreferencesProvider>{children}</UiPreferencesProvider>
      </body>
    </html>
  );
}
