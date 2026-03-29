"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";
import { renderMarkdownToHtml } from "@/lib/markdown";

type AdminMarkdownEditorProps = {
  initialAuthenticated: boolean;
  initialMarkdown: string;
};

type AuthResponse = {
  authenticated?: boolean;
  markdown?: string;
  detail?: string;
};

type SaveResponse = {
  markdown?: string;
  detail?: string;
  translationQueued?: boolean;
};

type AdminConfigResponse = {
  backend_api_base_url?: string;
  backend_api_base_url_override?: string | null;
  backend_api_password?: string;
  backend_api_password_override?: string | null;
  extract_link_enabled?: boolean;
  subscription_enabled?: boolean;
  default_backend_api_base_url?: string;
  default_backend_api_password?: string;
  detail?: string;
};

const EMOJI_OPTIONS = [
  "⚠️",
  "📢",
  "📣",
  "✨",
  "🔥",
  "🚀",
  "💡",
  "✅",
  "❌",
  "🔒",
  "🔑",
  "📝",
  "👀",
  "⏳",
  "⭐",
  "🎉",
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminMarkdownEditor({
  initialAuthenticated,
  initialMarkdown,
}: AdminMarkdownEditorProps) {
  const { language } = useUiPreferences();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [backendApiBaseUrl, setBackendApiBaseUrl] = useState("");
  const [backendApiBaseUrlOverride, setBackendApiBaseUrlOverride] = useState<string | null>(null);
  const [backendApiPassword, setBackendApiPassword] = useState("");
  const [backendApiPasswordOverride, setBackendApiPasswordOverride] = useState<string | null>(null);
  const [defaultBackendApiBaseUrl, setDefaultBackendApiBaseUrl] = useState("");
  const [defaultBackendApiPassword, setDefaultBackendApiPassword] = useState("");
  const [extractLinkEnabled, setExtractLinkEnabled] = useState(true);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const copy =
    language === "zh"
      ? {
          loginFailed: "登录失败。",
          enteredEditor: "已进入编辑区。",
          saveFailed: "保存失败。",
          saved: "内容已保存，正在后台更新多语言副本。",
          loggedOut: "已退出编辑区。",
          backendLoadFailed: "后端地址配置加载失败。",
          backendSaveFailed: "后端地址保存失败。",
          backendSaved: "后端地址已更新。",
          backendResetDone: "已恢复默认后端地址。",
          modeSaveFailed: "业务模式开关保存失败。",
          modeSaved: "业务模式开关已更新。",
          admin: "Admin",
          title: "Markdown 编辑区",
          introPrefix: "这里编辑的内容会显示在首页最上方。默认密码是 ",
          backHome: "返回首页",
          logout: "退出登录",
          passwordTitle: "输入密码",
          passwordDescription: "通过验证后才可以进入 Markdown 编辑区并保存首页说明。",
          passwordPlaceholder: "输入管理员密码",
          enterEditor: "进入编辑区",
          checking: "验证中...",
          supportedMarkdown: "支持的 Markdown",
          markdownFeatures: "标题、加粗、斜体、链接、引用块、列表、分隔线和代码块都可以直接使用。",
          editor: "Editor",
          editorTitle: "Markdown 源码",
          editorHint: "这里只维护一份中文源 Markdown。每次保存后，系统会在后台更新英文和越南语副本；首页切换语言时优先读取已保存的副本。",
          pickEmoji: "选择 Emoji",
          saving: "保存中...",
          save: "保存内容",
          emoji: "Emoji",
          preview: "Preview",
          previewTitle: "实时预览",
          emptyNotice: "当前暂无说明内容。",
          backendKicker: "Backend",
          backendTitle: "后端地址",
          backendDescription: "这里设置 Next.js 管理端转发到哪一个 Pixel 后端。保存后，首页和管理端的服务端请求都会立即使用新地址，并自动带上当前配置的后端鉴权密码。",
          backendInputLabel: "后端 API 地址",
          backendInputPlaceholder: "例如 http://127.0.0.1:8006",
          backendPasswordLabel: "后端鉴权密码",
          backendPasswordPlaceholder: "输入 Next.js 调后端时使用的密码",
          backendCurrentLabel: "当前生效地址",
          backendDefaultLabel: "环境默认地址",
          backendPasswordSourceLabel: "密码来源",
          backendUsingOverride: "当前使用的是你在 Admin 页保存的覆盖地址。",
          backendUsingDefault: "当前没有覆盖地址，系统会使用环境变量中的默认地址。",
          backendPasswordUsingOverride: "当前使用的是你在 Admin 页保存的后端密码。",
          backendPasswordUsingDefault: "当前没有覆盖密码，系统会使用 PIXEL_WEBSALE_API_PASSWORD 作为默认密码。",
          backendSave: "保存地址",
          backendReset: "恢复默认",
          modeKicker: "Modes",
          modeTitle: "业务模式开关",
          modeDescription: "在这里控制首页是否允许提交提链模式或订阅模式。关闭后，对应按钮会显示维护中，服务端也会拒绝该模式的提交请求。",
          modeSave: "保存开关",
          extractLinkMode: "提链模式",
          subscriptionMode: "订阅模式",
          modeEnabled: "开启",
          modeMaintenance: "维护中",
        }
      : {
          loginFailed: "Login failed.",
          enteredEditor: "Editor unlocked.",
          saveFailed: "Save failed.",
          saved: "Content saved. Background language copies are updating now.",
          loggedOut: "Signed out.",
          backendLoadFailed: "Failed to load backend address settings.",
          backendSaveFailed: "Failed to save the backend address.",
          backendSaved: "Backend address updated.",
          backendResetDone: "Reverted to the default backend address.",
          modeSaveFailed: "Failed to save run mode switches.",
          modeSaved: "Run mode switches updated.",
          admin: "Admin",
          title: "Markdown Editor",
          introPrefix: "Content edited here will appear at the top of the homepage. Default password: ",
          backHome: "Back Home",
          logout: "Sign Out",
          passwordTitle: "Enter Password",
          passwordDescription: "You need to authenticate before editing and saving the homepage notice board.",
          passwordPlaceholder: "Enter admin password",
          enterEditor: "Open Editor",
          checking: "Checking...",
          supportedMarkdown: "Supported Markdown",
          markdownFeatures: "Headings, bold, italic, links, blockquotes, lists, rules, and code blocks are supported.",
          editor: "Editor",
          editorTitle: "Markdown Source",
          editorHint: "This editor maintains the Chinese source Markdown only. After each save, the app updates the English and Vietnamese copies in the background and the homepage prefers those saved copies when the language changes.",
          pickEmoji: "Emoji",
          saving: "Saving...",
          save: "Save Content",
          emoji: "Emoji",
          preview: "Preview",
          previewTitle: "Live Preview",
          emptyNotice: "No notice content yet.",
          backendKicker: "Backend",
          backendTitle: "Backend Address",
          backendDescription: "Set which Pixel backend the Next.js admin and homepage server routes should talk to. Once saved, server-side requests switch immediately and keep sending the currently configured backend password automatically.",
          backendInputLabel: "Backend API URL",
          backendInputPlaceholder: "For example http://127.0.0.1:8006",
          backendPasswordLabel: "Backend Password",
          backendPasswordPlaceholder: "Enter the password Next.js should send to the backend",
          backendCurrentLabel: "Active backend",
          backendDefaultLabel: "Env default",
          backendPasswordSourceLabel: "Password source",
          backendUsingOverride: "The admin page is currently using the saved override URL.",
          backendUsingDefault: "No override is saved right now, so the env default URL is active.",
          backendPasswordUsingOverride: "The admin page is currently using the saved override password.",
          backendPasswordUsingDefault: "No override password is saved right now, so PIXEL_WEBSALE_API_PASSWORD is active.",
          backendSave: "Save URL",
          backendReset: "Use Default",
          modeKicker: "Modes",
          modeTitle: "Run Mode Switches",
          modeDescription: "Control whether the homepage can submit redeem mode or subscription mode. When a mode is off, its submit button shows maintenance and the server also rejects that mode.",
          modeSave: "Save Switches",
          extractLinkMode: "Redeem Mode",
          subscriptionMode: "Subscription Mode",
          modeEnabled: "Enabled",
          modeMaintenance: "Maintenance",
        };
  const deferredMarkdown = useDeferredValue(markdown);
  const previewHtml = useMemo(
    () => renderMarkdownToHtml(deferredMarkdown, copy.emptyNotice),
    [copy.emptyNotice, deferredMarkdown]
  );
  const activeBackendApiBaseUrl =
    backendApiBaseUrlOverride || defaultBackendApiBaseUrl || backendApiBaseUrl;
  const activeBackendApiPassword =
    backendApiPasswordOverride || defaultBackendApiPassword || backendApiPassword;
  const maskedBackendApiPassword = activeBackendApiPassword
    ? "*".repeat(Math.max(8, activeBackendApiPassword.length))
    : "-";

  const applyAdminConfigPayload = (payload: AdminConfigResponse) => {
    const nextDefault = payload.default_backend_api_base_url || "";
    const nextOverride =
      typeof payload.backend_api_base_url_override === "string" &&
      payload.backend_api_base_url_override.trim()
        ? payload.backend_api_base_url_override
        : null;
    const nextDefaultPassword = payload.default_backend_api_password || "";
    const nextPasswordOverride =
      typeof payload.backend_api_password_override === "string" &&
      payload.backend_api_password_override.trim()
        ? payload.backend_api_password_override
        : null;

    setDefaultBackendApiBaseUrl(nextDefault);
    setBackendApiBaseUrlOverride(nextOverride);
    setBackendApiBaseUrl(payload.backend_api_base_url || nextOverride || nextDefault);
    setDefaultBackendApiPassword(nextDefaultPassword);
    setBackendApiPasswordOverride(nextPasswordOverride);
    setBackendApiPassword(
      payload.backend_api_password || nextPasswordOverride || nextDefaultPassword
    );
    setExtractLinkEnabled(payload.extract_link_enabled !== false);
    setSubscriptionEnabled(payload.subscription_enabled !== false);
  };

  const loadAdminConfig = async () => {
    const response = await fetch("/api/admin/config", {
      headers: {
        "x-ui-language": language,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
    if (!response.ok) {
      throw new Error(payload.detail || copy.backendLoadFailed);
    }

    applyAdminConfigPayload(payload);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setBackendApiBaseUrl("");
      setBackendApiBaseUrlOverride(null);
      setBackendApiPassword("");
      setBackendApiPasswordOverride(null);
      setDefaultBackendApiBaseUrl("");
      setDefaultBackendApiPassword("");
      setExtractLinkEnabled(true);
      setSubscriptionEnabled(true);
      return;
    }

    void loadAdminConfig().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : copy.backendLoadFailed);
    });
  }, [copy.backendLoadFailed, isAuthenticated, language]);

  const handleLogin = () => {
    startTransition(async () => {
      try {
        setError(null);
        setStatus(null);

        const response = await fetch("/api/admin/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({ password }),
        });

        const payload = (await response.json().catch(() => ({}))) as AuthResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.loginFailed);
        }

        setIsAuthenticated(true);
        setMarkdown(payload.markdown || "");
        setPassword("");
        setStatus(copy.enteredEditor);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.loginFailed);
      }
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        setError(null);
        setStatus(null);

        const response = await fetch("/api/admin/content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({ markdown }),
        });

        const payload = (await response.json().catch(() => ({}))) as SaveResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.saveFailed);
        }

        setMarkdown(payload.markdown || "");
        setStatus(copy.saved);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.saveFailed);
      }
    });
  };

  const handleSaveBackendConfig = () => {
    startTransition(async () => {
      try {
        setError(null);
        setStatus(null);

        const response = await fetch("/api/admin/config", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({
            backend_api_base_url: backendApiBaseUrl,
            backend_api_password: backendApiPassword,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.backendSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.backendSaved);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.backendSaveFailed);
      }
    });
  };

  const handleResetBackendConfig = () => {
    startTransition(async () => {
      try {
        setError(null);
        setStatus(null);

        const response = await fetch("/api/admin/config", {
          method: "DELETE",
          headers: {
            "x-ui-language": language,
          },
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.backendSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.backendResetDone);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.backendSaveFailed);
      }
    });
  };

  const handleSaveRunModeConfig = () => {
    startTransition(async () => {
      try {
        setError(null);
        setStatus(null);

        const response = await fetch("/api/admin/config", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({
            extract_link_enabled: extractLinkEnabled,
            subscription_enabled: subscriptionEnabled,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.modeSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.modeSaved);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.modeSaveFailed);
      }
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      try {
        await fetch("/api/admin/auth", {
          method: "DELETE",
        });
      } finally {
        setIsAuthenticated(false);
        setPassword("");
        setMarkdown("");
        setBackendApiBaseUrl("");
        setBackendApiBaseUrlOverride(null);
        setBackendApiPassword("");
        setBackendApiPasswordOverride(null);
        setDefaultBackendApiBaseUrl("");
        setDefaultBackendApiPassword("");
        setExtractLinkEnabled(true);
        setSubscriptionEnabled(true);
        setError(null);
        setStatus(copy.loggedOut);
      }
    });
  };

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const { start, end } = selectionRef.current;
    const safeStart = Number.isFinite(start) ? start : markdown.length;
    const safeEnd = Number.isFinite(end) ? end : markdown.length;
    const nextMarkdown = `${markdown.slice(0, safeStart)}${emoji}${markdown.slice(safeEnd)}`;
    const nextCaret = safeStart + emoji.length;

    setMarkdown(nextMarkdown);
    setIsEmojiPickerOpen(false);
    setStatus(null);
    setError(null);

    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      selectionRef.current = { start: nextCaret, end: nextCaret };
    });
  };

  return (
    <section className="panel overflow-hidden p-5 md:p-6">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-kicker">{copy.admin}</p>
            <h1 className="section-title">{copy.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              {copy.introPrefix}
              <span className="font-mono">123456</span>
              {language === "zh" ? "。" : "."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="theme-button-secondary"
            >
              {copy.backHome}
            </Link>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                className={classNames(
                  "",
                  isPending
                    ? "theme-button-disabled"
                    : "theme-button-primary"
                )}
              >
                {copy.logout}
              </button>
            ) : null}
          </div>
        </div>

        {status ? <div className="notice notice-success">{status}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}

        {!isAuthenticated ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <div className="surface-soft rounded-[1.6rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="space-y-3">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">{copy.passwordTitle}</h2>
                <p className="text-sm leading-7 text-[var(--muted)]">
                  {copy.passwordDescription}
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={copy.passwordPlaceholder}
                  className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                />
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isPending}
                  className={classNames(
                    "",
                    isPending
                      ? "theme-button-disabled"
                      : "theme-button-primary"
                  )}
                >
                  {isPending ? copy.checking : copy.enterEditor}
                </button>
              </div>
            </div>

            <div className="surface-subtle rounded-[1.6rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.46)] p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                {copy.supportedMarkdown}
              </div>
              <div className="text-sm leading-7 text-[var(--muted)]">
                {copy.markdownFeatures}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.backendKicker}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.backendTitle}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {copy.backendDescription}
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="grid gap-3">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {copy.backendInputLabel}
                      </span>
                      <input
                        type="url"
                        value={backendApiBaseUrl}
                        onChange={(event) => setBackendApiBaseUrl(event.target.value)}
                        placeholder={copy.backendInputPlaceholder}
                        className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {copy.backendPasswordLabel}
                      </span>
                      <input
                        type="password"
                        value={backendApiPassword}
                        onChange={(event) => setBackendApiPassword(event.target.value)}
                        placeholder={copy.backendPasswordPlaceholder}
                        className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:self-start">
                    <button
                      type="button"
                      onClick={handleSaveBackendConfig}
                      disabled={isPending}
                      className={classNames(
                        "",
                        isPending
                          ? "theme-button-disabled"
                          : "theme-button-primary"
                      )}
                    >
                      {isPending ? copy.saving : copy.backendSave}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetBackendConfig}
                      disabled={isPending}
                      className={classNames(
                        "theme-button-secondary",
                        isPending && "theme-button-disabled"
                      )}
                    >
                      {copy.backendReset}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm leading-7 text-[var(--muted)]">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.backendCurrentLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">
                      {activeBackendApiBaseUrl || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.backendDefaultLabel}:</span>{" "}
                    <span className="font-mono break-all">
                      {defaultBackendApiBaseUrl || "-"}
                    </span>
                  </div>
                  <div>
                    {backendApiBaseUrlOverride ? copy.backendUsingOverride : copy.backendUsingDefault}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.backendPasswordSourceLabel}:</span>{" "}
                    {backendApiPasswordOverride
                      ? copy.backendPasswordUsingOverride
                      : copy.backendPasswordUsingDefault}
                  </div>
                  <div className="font-mono break-all text-[var(--teal)]">
                    {maskedBackendApiPassword}
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.modeKicker}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.modeTitle}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {copy.modeDescription}
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {[
                    {
                      key: "extract_link",
                      label: copy.extractLinkMode,
                      enabled: extractLinkEnabled,
                      onChange: setExtractLinkEnabled,
                    },
                    {
                      key: "subscription",
                      label: copy.subscriptionMode,
                      enabled: subscriptionEnabled,
                      onChange: setSubscriptionEnabled,
                    },
                  ].map((mode) => (
                    <label
                      key={mode.key}
                      className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.78)] px-4 py-4"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-semibold">{mode.label}</div>
                        <div className="mt-1 text-sm text-[var(--muted)]">
                          {mode.enabled ? copy.modeEnabled : copy.modeMaintenance}
                        </div>
                      </div>

                      <span className="relative inline-flex shrink-0 items-center">
                        <input
                          type="checkbox"
                          checked={mode.enabled}
                          onChange={(event) => mode.onChange(event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className="h-7 w-12 rounded-full bg-[rgba(31,35,28,0.14)] transition peer-checked:bg-[var(--teal)]" />
                        <span className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                      </span>
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveRunModeConfig}
                    disabled={isPending}
                    className={classNames(
                      "",
                      isPending
                        ? "theme-button-disabled"
                        : "theme-button-primary"
                    )}
                  >
                    {isPending ? copy.saving : copy.modeSave}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                      {copy.editor}
                    </div>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.editorTitle}</h2>
                    <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
                      {copy.editorHint}
                    </p>
                  </div>
                  <div className="relative flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEmojiPickerOpen((current) => !current)}
                      className="theme-button-secondary"
                    >
                      {copy.pickEmoji}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isPending}
                      className={classNames(
                        "",
                        isPending
                          ? "theme-button-disabled"
                          : "theme-button-primary"
                      )}
                    >
                      {isPending ? copy.saving : copy.save}
                    </button>

                    {isEmojiPickerOpen ? (
                      <div className="emoji-picker-panel">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                          {copy.emoji}
                        </div>
                        <div className="emoji-picker-grid">
                          {EMOJI_OPTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertEmoji(emoji)}
                              className="emoji-picker-button"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  onClick={rememberSelection}
                  onKeyUp={rememberSelection}
                  onSelect={rememberSelection}
                  spellCheck={false}
                  className="min-h-[30rem] w-full rounded-[1.1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-4 font-mono text-sm leading-7 outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                />
              </div>

              <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
                <div className="mb-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.preview}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.previewTitle}</h2>
                </div>

                <div className="markdown-board-shell min-h-[30rem]">
                  <div
                    className="markdown-prose"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
