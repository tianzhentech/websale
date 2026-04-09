"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";
import { renderMarkdownToHtml } from "@/lib/markdown";
import {
  NOTICE_TRANSLATION_CONTENT_TOKEN,
  NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN,
} from "@/lib/notice-translation-prompts";

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
  backend_api_password?: string;
  ai_api_base_url?: string;
  ai_api_key?: string;
  ai_model?: string;
  extract_link_enabled?: boolean | null;
  subscription_enabled?: boolean | null;
  overview_activity_window_minutes?: number | null;
  notice_translation_system_prompt?: string;
  notice_translation_user_prompt_template?: string;
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
  const [backendApiPassword, setBackendApiPassword] = useState("");
  const [aiApiBaseUrl, setAiApiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [extractLinkEnabled, setExtractLinkEnabled] = useState(true);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(true);
  const [overviewActivityWindowMinutes, setOverviewActivityWindowMinutes] = useState("");
  const [noticeTranslationSystemPrompt, setNoticeTranslationSystemPrompt] = useState("");
  const [noticeTranslationUserPromptTemplate, setNoticeTranslationUserPromptTemplate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const copy =
    language === "zh"
      ? {
          loginFailed: "登录失败。",
          enteredEditor: "已进入管理后台。",
          saveFailed: "保存失败。",
          saved: "内容已保存，正在后台更新多语言副本。",
          loggedOut: "已退出管理后台。",
          backendLoadFailed: "后端地址配置加载失败。",
          backendSaveFailed: "后端地址保存失败。",
          backendSaved: "后端地址已更新。",
          aiSaveFailed: "AI 配置保存失败。",
          aiSaved: "AI 配置已更新。",
          modeSaveFailed: "业务模式开关保存失败。",
          modeSaved: "业务模式开关已更新。",
          overviewSaveFailed: "热力图时间窗口保存失败。",
          overviewSaved: "热力图时间窗口已更新。",
          translationPromptSaveFailed: "公告翻译 Prompt 保存失败。",
          translationPromptSaved: "公告翻译 Prompt 已更新，并已重新触发多语言翻译。",
          admin: "Admin",
          title: "管理后台",
          introPrefix: "此页面仅供已授权管理员访问。",
          backHome: "返回首页",
          logout: "退出登录",
          passwordTitle: "管理员验证",
          passwordDescription: "通过验证后才可以进入管理后台。",
          passwordPlaceholder: "输入管理员密码",
          enterEditor: "进入管理后台",
          checking: "验证中...",
          supportedMarkdown: "访问说明",
          markdownFeatures: "后台内容仅在验证通过后显示，未授权访问不会公开任何管理细节。",
          editor: "Notice",
          editorTitle: "首页公告内容",
          editorHint: "这里维护首页顶部公告的中文源 Markdown / HTML。每次保存后，系统会在后台更新英文和越南语副本；首页切换语言时优先读取已保存的副本。",
          pickEmoji: "选择 Emoji",
          saving: "保存中...",
          save: "保存公告内容",
          emoji: "Emoji",
          preview: "Preview",
          previewTitle: "首页公告预览",
          emptyNotice: "当前暂无说明内容。",
          backendKicker: "Backend",
          backendTitle: "后端地址",
          backendDescription: "这里设置 Next.js 管理端转发到哪一个 Pixel 后端。保存后会直接写回 .env.local，首页和管理端的服务端请求都会立即使用新地址，并自动带上当前配置的后端鉴权密码。",
          backendInputLabel: "后端 API 地址",
          backendInputPlaceholder: "例如 http://127.0.0.1:8006",
          backendPasswordLabel: "后端鉴权密码",
          backendPasswordPlaceholder: "输入 Next.js 调后端时使用的密码",
          backendCurrentLabel: "当前生效地址",
          backendCurrentPasswordLabel: "当前生效密码",
          backendSave: "保存地址",
          aiKicker: "AI",
          aiTitle: "AI 接口配置",
          aiDescription: "这里统一配置格式转换和公告翻译共用的 AI 接口参数。保存后会直接写回 .env.local 并立即生效。Base URL 请填写服务根地址，系统会自动请求 /v1/chat/completions。",
          aiBaseUrlLabel: "AI Base URL",
          aiBaseUrlPlaceholder: "例如 https://api.openai.com",
          aiApiKeyLabel: "AI API Key",
          aiApiKeyPlaceholder: "输入调用模型时使用的 API Key",
          aiModelLabel: "模型名称",
          aiModelPlaceholder: "例如 gpt-5.2",
          aiActiveBaseUrlLabel: "当前生效 Base URL",
          aiActiveApiKeyLabel: "当前生效 API Key",
          aiActiveModelLabel: "当前生效模型",
          aiSave: "保存 AI 配置",
          modeKicker: "Modes",
          modeTitle: "业务模式开关",
          modeDescription: "在这里控制首页是否允许提交提链模式或订阅模式。切换后会直接写回 .env.local 并立即生效；关闭后，对应入队按钮会显示正在维护，服务端也会拒绝该模式的提交请求。",
          extractLinkMode: "提链模式",
          subscriptionMode: "订阅模式",
          modeEnabled: "开启",
          modeMaintenance: "正在维护",
          modeEnableAction: "恢复开启",
          modeDisableAction: "切换为维护",
          overviewKicker: "Overview",
          overviewTitle: "热力图时间窗口",
          overviewDescription: "这里控制首页概览热力格子只保留最近多少分钟内的任务事件。保存后会直接写回 .env.local 并立即生效，超出窗口的旧事件会自动移出显示。",
          overviewWindowLabel: "显示窗口（分钟）",
          overviewWindowPlaceholder: "例如 180",
          overviewCurrentLabel: "当前窗口",
          overviewSave: "保存窗口",
          translationPromptKicker: "Translation",
          translationPromptTitle: "公告翻译 Prompt",
          translationPromptDescription: "这里控制公告多语言翻译时发送给模型的提示词。保存后会直接写回 .env.local，系统会按新的 Prompt 重新后台生成英文和越南语副本。",
          translationPromptSystemLabel: "System Prompt",
          translationPromptUserLabel: "User Prompt 模板",
          translationPromptSystemPlaceholder: "输入翻译 system prompt",
          translationPromptUserPlaceholder: "输入带占位符的 user prompt 模板",
          translationPromptTokensLabel: "必须保留的占位符",
          translationPromptSave: "保存 Prompt",
        }
      : {
          loginFailed: "Login failed.",
          enteredEditor: "Admin console unlocked.",
          saveFailed: "Save failed.",
          saved: "Content saved. Background language copies are updating now.",
          loggedOut: "Signed out of the admin console.",
          backendLoadFailed: "Failed to load backend address settings.",
          backendSaveFailed: "Failed to save the backend address.",
          backendSaved: "Backend address updated.",
          aiSaveFailed: "Failed to save the AI settings.",
          aiSaved: "AI settings updated.",
          modeSaveFailed: "Failed to save run mode switches.",
          modeSaved: "Run mode switches updated.",
          overviewSaveFailed: "Failed to save the heatmap activity window.",
          overviewSaved: "Heatmap activity window updated.",
          translationPromptSaveFailed: "Failed to save the notice translation prompt.",
          translationPromptSaved: "Notice translation prompt updated. Background translations were requeued.",
          admin: "Admin",
          title: "Admin Console",
          introPrefix: "This page is restricted to authorized administrators only.",
          backHome: "Back Home",
          logout: "Sign Out",
          passwordTitle: "Admin Access",
          passwordDescription: "Authenticate before entering the admin console.",
          passwordPlaceholder: "Enter admin password",
          enterEditor: "Open Console",
          checking: "Checking...",
          supportedMarkdown: "Access Notice",
          markdownFeatures: "Admin details stay hidden until authentication succeeds. No management scope is exposed on the public login view.",
          editor: "Notice",
          editorTitle: "Homepage Notice Content",
          editorHint: "Maintain the Chinese source Markdown / HTML for the homepage notice here. After each save, the app updates the English and Vietnamese copies in the background and the homepage prefers those saved copies when the language changes.",
          pickEmoji: "Emoji",
          saving: "Saving...",
          save: "Save Notice",
          emoji: "Emoji",
          preview: "Preview",
          previewTitle: "Homepage Notice Preview",
          emptyNotice: "No notice content yet.",
          backendKicker: "Backend",
          backendTitle: "Backend Address",
          backendDescription: "Set which Pixel backend the Next.js admin and homepage server routes should talk to. Saving writes directly to .env.local, and server-side requests switch immediately while continuing to send the configured backend password automatically.",
          backendInputLabel: "Backend API URL",
          backendInputPlaceholder: "For example http://127.0.0.1:8006",
          backendPasswordLabel: "Backend Password",
          backendPasswordPlaceholder: "Enter the password Next.js should send to the backend",
          backendCurrentLabel: "Active backend",
          backendCurrentPasswordLabel: "Active backend password",
          backendSave: "Save URL",
          aiKicker: "AI",
          aiTitle: "AI Connection Settings",
          aiDescription: "Control the shared AI endpoint used by the format converter and notice translation. Saving writes directly to .env.local and applies immediately. Enter the provider root URL here and the app will call /v1/chat/completions automatically.",
          aiBaseUrlLabel: "AI Base URL",
          aiBaseUrlPlaceholder: "For example https://api.openai.com",
          aiApiKeyLabel: "AI API Key",
          aiApiKeyPlaceholder: "Enter the API key used for model requests",
          aiModelLabel: "Model Name",
          aiModelPlaceholder: "For example gpt-5.2",
          aiActiveBaseUrlLabel: "Active base URL",
          aiActiveApiKeyLabel: "Active API key",
          aiActiveModelLabel: "Active model",
          aiSave: "Save AI Settings",
          modeKicker: "Modes",
          modeTitle: "Run Mode Switches",
          modeDescription: "Control whether the homepage can submit redeem mode or subscription mode. Saving writes directly to .env.local and applies immediately. When a mode is off, its submit button shows maintenance and the server also rejects that mode.",
          extractLinkMode: "Redeem Mode",
          subscriptionMode: "Subscription Mode",
          modeEnabled: "Enabled",
          modeMaintenance: "Under Maintenance",
          modeEnableAction: "Resume",
          modeDisableAction: "Enter Maintenance",
          overviewKicker: "Overview",
          overviewTitle: "Heatmap Activity Window",
          overviewDescription: "Control how many recent minutes of task events the homepage overview heatmap should keep. Saving writes directly to .env.local and applies immediately, and older events outside the window drop out automatically.",
          overviewWindowLabel: "Window (minutes)",
          overviewWindowPlaceholder: "For example 180",
          overviewCurrentLabel: "Active window",
          overviewSave: "Save Window",
          translationPromptKicker: "Translation",
          translationPromptTitle: "Notice Translation Prompt",
          translationPromptDescription: "Control the prompt sent to the model when the notice is translated into other languages. Saving writes directly to .env.local and requeues the English and Vietnamese copies with the new prompt.",
          translationPromptSystemLabel: "System Prompt",
          translationPromptUserLabel: "User Prompt Template",
          translationPromptSystemPlaceholder: "Enter the translation system prompt",
          translationPromptUserPlaceholder: "Enter the user prompt template with placeholders",
          translationPromptTokensLabel: "Required placeholders",
          translationPromptSave: "Save Prompt",
        };
  const deferredMarkdown = useDeferredValue(markdown);
  const previewHtml = useMemo(
    () => renderMarkdownToHtml(deferredMarkdown, copy.emptyNotice),
    [copy.emptyNotice, deferredMarkdown]
  );
  const maskedBackendApiPassword = backendApiPassword
    ? "*".repeat(Math.max(8, backendApiPassword.length))
    : "-";
  const maskedAiApiKey = aiApiKey
    ? "*".repeat(Math.max(8, aiApiKey.length))
    : "-";

  const applyAdminConfigPayload = (payload: AdminConfigResponse) => {
    setBackendApiBaseUrl(payload.backend_api_base_url || "");
    setBackendApiPassword(payload.backend_api_password || "");
    setAiApiBaseUrl(payload.ai_api_base_url || "");
    setAiApiKey(payload.ai_api_key || "");
    setAiModel(payload.ai_model || "");
    setExtractLinkEnabled(payload.extract_link_enabled === true);
    setSubscriptionEnabled(payload.subscription_enabled === true);
    setOverviewActivityWindowMinutes(
      typeof payload.overview_activity_window_minutes === "number" &&
        Number.isFinite(payload.overview_activity_window_minutes)
        ? String(payload.overview_activity_window_minutes)
        : ""
    );
    setNoticeTranslationSystemPrompt(payload.notice_translation_system_prompt || "");
    setNoticeTranslationUserPromptTemplate(
      payload.notice_translation_user_prompt_template || ""
    );
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
      setBackendApiPassword("");
      setAiApiBaseUrl("");
      setAiApiKey("");
      setAiModel("");
      setExtractLinkEnabled(true);
      setSubscriptionEnabled(true);
      setOverviewActivityWindowMinutes("");
      setNoticeTranslationSystemPrompt("");
      setNoticeTranslationUserPromptTemplate("");
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

  const handleSaveAiConfig = () => {
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
            ai_api_base_url: aiApiBaseUrl,
            ai_api_key: aiApiKey,
            ai_model: aiModel,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.aiSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.aiSaved);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.aiSaveFailed);
      }
    });
  };

  const handleSaveOverviewConfig = () => {
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
            overview_activity_window_minutes: overviewActivityWindowMinutes,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.overviewSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.overviewSaved);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : copy.overviewSaveFailed);
      }
    });
  };

  const persistRunModeConfig = (
    nextExtractLinkEnabled: boolean,
    nextSubscriptionEnabled: boolean
  ) => {
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
            extract_link_enabled: nextExtractLinkEnabled,
            subscription_enabled: nextSubscriptionEnabled,
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

  const handleToggleRunMode = (runMode: "extract_link" | "subscription") => {
    const nextExtractLinkEnabled =
      runMode === "extract_link" ? !extractLinkEnabled : extractLinkEnabled;
    const nextSubscriptionEnabled =
      runMode === "subscription" ? !subscriptionEnabled : subscriptionEnabled;

    persistRunModeConfig(nextExtractLinkEnabled, nextSubscriptionEnabled);
  };

  const handleSaveTranslationPromptConfig = () => {
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
            notice_translation_system_prompt: noticeTranslationSystemPrompt,
            notice_translation_user_prompt_template: noticeTranslationUserPromptTemplate,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as AdminConfigResponse;
        if (!response.ok) {
          throw new Error(payload.detail || copy.translationPromptSaveFailed);
        }

        applyAdminConfigPayload(payload);
        setStatus(copy.translationPromptSaved);
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : copy.translationPromptSaveFailed
        );
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
        setBackendApiPassword("");
        setAiApiBaseUrl("");
        setAiApiKey("");
        setAiModel("");
        setExtractLinkEnabled(true);
        setSubscriptionEnabled(true);
        setOverviewActivityWindowMinutes("");
        setNoticeTranslationSystemPrompt("");
        setNoticeTranslationUserPromptTemplate("");
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
      <div
        className={classNames(
          "grid gap-5",
          !isAuthenticated && "min-h-[calc(100vh-12rem)] content-center justify-items-center"
        )}
      >
        {!isAuthenticated ? (
          <div className="absolute right-5 top-5 md:right-6 md:top-6">
            <Link
              href="/"
              className="theme-button-secondary"
            >
              {copy.backHome}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">{copy.admin}</p>
              <h1 className="section-title">{copy.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                {copy.introPrefix}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="theme-button-secondary"
              >
                {copy.backHome}
              </Link>
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
            </div>
          </div>
        )}

        {status ? (
          <div
            className={classNames(
              "notice notice-success",
              !isAuthenticated && "w-full max-w-[48rem] text-center"
            )}
          >
            {status}
          </div>
        ) : null}
        {error ? (
          <div
            className={classNames(
              "notice notice-error",
              !isAuthenticated && "w-full max-w-[48rem] text-center"
            )}
          >
            {error}
          </div>
        ) : null}

        {!isAuthenticated ? (
          <div className="flex w-full justify-center py-2 md:py-4">
            <div className="surface-soft w-full max-w-[42rem] rounded-[1.8rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-8 md:p-10">
              <div className="grid justify-items-center gap-4 text-center">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">{copy.passwordTitle}</h2>
                <p className="max-w-[24rem] text-sm leading-7 text-[var(--muted)]">
                  {copy.passwordDescription}
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={copy.passwordPlaceholder}
                  className="w-full max-w-[26rem] rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
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
                  </div>
                </div>

                <div className="grid gap-2 text-sm leading-7 text-[var(--muted)]">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.backendCurrentLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">
                      {backendApiBaseUrl || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.backendCurrentPasswordLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">{maskedBackendApiPassword}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.aiKicker}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.aiTitle}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {copy.aiDescription}
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="grid gap-3">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {copy.aiBaseUrlLabel}
                      </span>
                      <input
                        type="url"
                        value={aiApiBaseUrl}
                        onChange={(event) => setAiApiBaseUrl(event.target.value)}
                        placeholder={copy.aiBaseUrlPlaceholder}
                        className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {copy.aiApiKeyLabel}
                      </span>
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(event) => setAiApiKey(event.target.value)}
                        placeholder={copy.aiApiKeyPlaceholder}
                        className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {copy.aiModelLabel}
                      </span>
                      <input
                        type="text"
                        value={aiModel}
                        onChange={(event) => setAiModel(event.target.value)}
                        placeholder={copy.aiModelPlaceholder}
                        className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:self-start">
                    <button
                      type="button"
                      onClick={handleSaveAiConfig}
                      disabled={isPending}
                      className={classNames("", isPending ? "theme-button-disabled" : "theme-button-primary")}
                    >
                      {isPending ? copy.saving : copy.aiSave}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm leading-7 text-[var(--muted)]">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.aiActiveBaseUrlLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">
                      {aiApiBaseUrl || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.aiActiveApiKeyLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">{maskedAiApiKey}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.aiActiveModelLabel}:</span>{" "}
                    <span className="font-mono break-all text-[var(--teal)]">{aiModel || "-"}</span>
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
                  {([
                    {
                      key: "extract_link",
                      label: copy.extractLinkMode,
                      enabled: extractLinkEnabled,
                    },
                    {
                      key: "subscription",
                      label: copy.subscriptionMode,
                      enabled: subscriptionEnabled,
                    },
                  ] as const).map((mode) => (
                    <article
                      key={mode.key}
                      className="surface-card grid gap-4 rounded-[1.2rem] border px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold">{mode.label}</div>
                          <div className="mt-1 text-sm text-[var(--muted)]">
                            {mode.enabled ? copy.modeEnabled : copy.modeMaintenance}
                          </div>
                        </div>

                        <span
                          className={classNames(
                            "inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                            mode.enabled
                              ? "bg-[var(--status-pill-bg)] text-[var(--status-pill-text)]"
                              : "bg-[var(--notice-error-bg)] text-[var(--notice-error-text)]"
                          )}
                        >
                          {mode.enabled ? copy.modeEnabled : copy.modeMaintenance}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleRunMode(mode.key)}
                          disabled={isPending}
                          className={classNames(
                            "",
                            isPending
                              ? "theme-button-disabled"
                              : mode.enabled
                                ? "theme-button-secondary"
                                : "theme-button-primary"
                          )}
                        >
                          {mode.enabled ? copy.modeDisableAction : copy.modeEnableAction}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.overviewKicker}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{copy.overviewTitle}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {copy.overviewDescription}
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_auto] lg:items-end">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {copy.overviewWindowLabel}
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={overviewActivityWindowMinutes}
                      onChange={(event) => setOverviewActivityWindowMinutes(event.target.value)}
                      placeholder={copy.overviewWindowPlaceholder}
                      className="w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2 lg:self-start">
                    <button
                      type="button"
                      onClick={handleSaveOverviewConfig}
                      disabled={isPending}
                      className={classNames(
                        "",
                        isPending
                          ? "theme-button-disabled"
                          : "theme-button-primary"
                      )}
                    >
                      {isPending ? copy.saving : copy.overviewSave}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm leading-7 text-[var(--muted)]">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">{copy.overviewCurrentLabel}:</span>{" "}
                    <span className="font-mono text-[var(--teal)]">
                      {overviewActivityWindowMinutes || "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-soft rounded-[1.7rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,255,255,0.58)] p-4">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
                    {copy.translationPromptKicker}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                    {copy.translationPromptTitle}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
                    {copy.translationPromptDescription}
                  </p>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {copy.translationPromptSystemLabel}
                    </span>
                    <textarea
                      value={noticeTranslationSystemPrompt}
                      onChange={(event) => setNoticeTranslationSystemPrompt(event.target.value)}
                      spellCheck={false}
                      placeholder={copy.translationPromptSystemPlaceholder}
                      className="min-h-[12rem] w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 font-mono text-sm leading-7 outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {copy.translationPromptUserLabel}
                    </span>
                    <textarea
                      value={noticeTranslationUserPromptTemplate}
                      onChange={(event) =>
                        setNoticeTranslationUserPromptTemplate(event.target.value)
                      }
                      spellCheck={false}
                      placeholder={copy.translationPromptUserPlaceholder}
                      className="min-h-[12rem] w-full rounded-[1rem] border border-[rgba(31,35,28,0.12)] bg-[rgba(255,255,255,0.82)] px-4 py-3 font-mono text-sm leading-7 outline-none transition focus:border-[rgba(18,92,95,0.28)] focus:ring-4 focus:ring-[rgba(18,92,95,0.12)]"
                    />
                  </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="text-sm leading-7 text-[var(--muted)]">
                    <span className="font-semibold text-[var(--ink)]">
                      {copy.translationPromptTokensLabel}:
                    </span>{" "}
                    <span className="font-mono text-[var(--teal)]">
                      {NOTICE_TRANSLATION_TARGET_LANGUAGE_TOKEN}
                    </span>{" "}
                    <span className="font-mono text-[var(--teal)]">
                      {NOTICE_TRANSLATION_CONTENT_TOKEN}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:self-start">
                    <button
                      type="button"
                      onClick={handleSaveTranslationPromptConfig}
                      disabled={isPending}
                      className={classNames("", isPending ? "theme-button-disabled" : "theme-button-primary")}
                    >
                      {isPending ? copy.saving : copy.translationPromptSave}
                    </button>
                  </div>
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
