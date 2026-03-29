"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useUiPreferences, type Language } from "@/components/ui-preferences-provider";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { isSupportedLanguage } from "@/lib/ui-language";

const SOURCE_LANGUAGE: Language = "zh";

export function MarkdownNoticeBoard({
  sourceMarkdown,
}: {
  sourceMarkdown: string;
}) {
  const { language } = useUiPreferences();
  const [translatedMarkdownByLanguage, setTranslatedMarkdownByLanguage] = useState<
    Partial<Record<Language, string>>
  >({});
  const [visibleMarkdown, setVisibleMarkdown] = useState(sourceMarkdown);
  const [isTranslating, setIsTranslating] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestControllerRef = useRef<AbortController | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetMarkdownRef = useRef(sourceMarkdown);
  const visibleLengthRef = useRef(sourceMarkdown.length);
  const streamDoneRef = useRef(true);

  const copy =
    language === "zh"
      ? {
          emptyNotice: "当前暂无说明内容。",
          loadingNotice: "正在加载说明内容...",
          loadingFailed: "说明内容加载失败，当前先显示原文。",
          usingSourceFallbackPending: "该语言副本正在后台更新，当前先显示原文。",
          usingSourceFallbackFailed: "该语言副本更新失败，当前先显示原文。",
        }
      : language === "vi"
        ? {
            emptyNotice: "Chua co noi dung thong bao.",
            loadingNotice: "Dang tai noi dung thong bao...",
            loadingFailed: "Khong tai duoc noi dung thong bao. Tam thoi hien thi ban goc.",
            usingSourceFallbackPending: "Ban sao ngon ngu nay dang duoc cap nhat nen tam thoi hien thi ban goc.",
            usingSourceFallbackFailed: "Cap nhat ban sao ngon ngu nay that bai nen tam thoi hien thi ban goc.",
          }
      : {
          emptyNotice: "No notice content yet.",
          loadingNotice: "Loading notice content...",
          loadingFailed: "Failed to load notice content. Showing the source markdown for now.",
          usingSourceFallbackPending: "This language copy is still updating in the background, so the source markdown is shown for now.",
          usingSourceFallbackFailed: "This language copy failed to update, so the source markdown is shown for now.",
        };

  const html = useMemo(
    () => renderMarkdownToHtml(visibleMarkdown, copy.emptyNotice),
    [copy.emptyNotice, visibleMarkdown]
  );

  const stopAnimation = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const cancelActiveRequest = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  };

  const startTypewriter = () => {
    if (animationFrameRef.current !== null) {
      return;
    }

    const revealNextFrame = () => {
      const fullMarkdown = targetMarkdownRef.current;
      const remaining = fullMarkdown.length - visibleLengthRef.current;

      if (remaining > 0) {
        const step = remaining > 180 ? 14 : remaining > 72 ? 8 : remaining > 24 ? 4 : 2;
        visibleLengthRef.current = Math.min(fullMarkdown.length, visibleLengthRef.current + step);
        setVisibleMarkdown(fullMarkdown.slice(0, visibleLengthRef.current));
      }

      if (visibleLengthRef.current < fullMarkdown.length || !streamDoneRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(revealNextFrame);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(revealNextFrame);
  };

  useEffect(() => {
    setTranslatedMarkdownByLanguage({});
    setNoticeMessage(null);
    setError(null);
    cancelActiveRequest();
    stopAnimation();
    targetMarkdownRef.current = sourceMarkdown;
    visibleLengthRef.current = sourceMarkdown.length;
    streamDoneRef.current = true;
    setVisibleMarkdown(sourceMarkdown);

    return () => {
      cancelActiveRequest();
      stopAnimation();
    };
  }, [sourceMarkdown]);

  useEffect(() => {
    cancelActiveRequest();
    stopAnimation();
    setNoticeMessage(null);
    setError(null);

    if (language === SOURCE_LANGUAGE) {
      targetMarkdownRef.current = sourceMarkdown;
      visibleLengthRef.current = sourceMarkdown.length;
      streamDoneRef.current = true;
      setVisibleMarkdown(sourceMarkdown);
      setIsTranslating(false);
      setNoticeMessage(null);
      return;
    }

    const cachedTranslation = translatedMarkdownByLanguage[language];
    if (cachedTranslation) {
      targetMarkdownRef.current = cachedTranslation;
      visibleLengthRef.current = 0;
      streamDoneRef.current = true;
      setVisibleMarkdown("");
      setIsTranslating(false);
      setNoticeMessage(null);
      startTypewriter();
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    targetMarkdownRef.current = "";
    visibleLengthRef.current = 0;
    streamDoneRef.current = false;
    setVisibleMarkdown("");
    setIsTranslating(true);
    startTypewriter();

    const loadTranslation = async () => {
      try {
        const response = await fetch("/api/notice/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({
            targetLanguage: language,
          }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || copy.loadingFailed);
        }

        if (!response.body) {
          throw new Error(copy.loadingFailed);
        }

        const contentLanguageHeader = response.headers.get("x-notice-content-language");
        const responseContentLanguage = isSupportedLanguage(contentLanguageHeader)
          ? contentLanguageHeader
          : SOURCE_LANGUAGE;
        const responseStatus = response.headers.get("x-notice-translation-status");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullMarkdown = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) {
            continue;
          }

          fullMarkdown += chunk;
          targetMarkdownRef.current = fullMarkdown;
          startTypewriter();
        }

        fullMarkdown += decoder.decode();
        targetMarkdownRef.current = fullMarkdown;
        streamDoneRef.current = true;
        if (responseContentLanguage === language && responseStatus === "ready") {
          setTranslatedMarkdownByLanguage((current) => ({
            ...current,
            [language]: fullMarkdown,
          }));
          setNoticeMessage(null);
        } else {
          setNoticeMessage(
            responseStatus === "failed"
              ? copy.usingSourceFallbackFailed
              : copy.usingSourceFallbackPending
          );
        }
        setIsTranslating(false);
        startTypewriter();
      } catch (nextError) {
        if (controller.signal.aborted) {
          return;
        }

        streamDoneRef.current = true;
        setIsTranslating(false);
        setError(nextError instanceof Error ? nextError.message : copy.loadingFailed);
        targetMarkdownRef.current = sourceMarkdown;
        visibleLengthRef.current = sourceMarkdown.length;
        setVisibleMarkdown(sourceMarkdown);
      }
    };

    void loadTranslation();

    return () => {
      controller.abort();
      streamDoneRef.current = true;
    };
  }, [
    copy.loadingFailed,
    copy.usingSourceFallbackFailed,
    copy.usingSourceFallbackPending,
    language,
    sourceMarkdown,
  ]);

  return (
    <section className="panel overflow-hidden">
      <div className="markdown-board-shell">
        {isTranslating ? <div className="notice notice-success mb-4">{copy.loadingNotice}</div> : null}
        {noticeMessage ? <div className="notice notice-success mb-4">{noticeMessage}</div> : null}
        {error ? <div className="notice notice-error mb-4">{error}</div> : null}
        <div
          className="markdown-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
