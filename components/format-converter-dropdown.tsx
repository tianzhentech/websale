"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";

type FormatConvertResponse = {
  normalizedLines: string[];
  normalizedText: string;
  lineCount: number;
  detail?: string;
};

const COPY = {
  zh: {
    tool: "格式转换",
    title: "账号格式转换工具",
    description:
      "把任意文本、JSON、CSV、表格残片或备注记录交给 LLM 整理，统一输出成 Email---Password---2FA密钥。",
    input: "原始输入",
    output: "标准输出",
    inputPlaceholder:
      "把任意账号内容贴到这里。\n\n支持混合格式，例如：\n- JSON / CSV / 文本段落\n- otpauth:// URL\n- 带中文说明的账号备注\n- 多账号批量列表",
    outputPlaceholder: "转换完成后，这里会输出每行 1 条的 Email---Password---2FA密钥。",
    convert: "开始转换",
    converting: "转换中...",
    clear: "清空",
    copy: "复制结果",
    copied: "已复制",
    copyFailed: "复制失败",
    emptyInput: "请先输入要转换的内容。",
    requestFailed: "格式转换请求失败",
    noMatch: "暂未识别到可转换的邮箱账号。",
    convertedCount: "已整理 {count} 条账号",
    privacyHint:
      "内容会发送到当前配置的 LLM 服务进行整理，请不要粘贴不应该外发的敏感数据。",
    workingHint:
      "系统会尽量从杂乱格式中提取邮箱、密码和 2FA 密钥，并统一整理成标准三段式。",
    shortcutHint: "支持多账号批量粘贴；在左侧输入框里按 Cmd/Ctrl + Enter 可直接转换。",
  },
  en: {
    tool: "Format Tool",
    title: "Account Format Converter",
    description:
      "Send arbitrary text, JSON, CSV, table fragments, or notes to the LLM and normalize them into Email---Password---2FA key lines.",
    input: "Raw Input",
    output: "Normalized Output",
    inputPlaceholder:
      "Paste any account content here.\n\nMixed formats are supported, for example:\n- JSON / CSV / prose\n- otpauth:// URLs\n- notes with extra annotations\n- bulk multi-account dumps",
    outputPlaceholder:
      "Converted lines will appear here as Email---Password---2FA key, one account per line.",
    convert: "Convert",
    converting: "Converting...",
    clear: "Clear",
    copy: "Copy Result",
    copied: "Copied",
    copyFailed: "Copy Failed",
    emptyInput: "Please enter content to convert.",
    requestFailed: "Format conversion request failed",
    noMatch: "No convertible email accounts were recognized yet.",
    convertedCount: "Normalized {count} account(s)",
    privacyHint:
      "The content will be sent to the configured LLM service for cleanup. Do not paste data that must stay local.",
    workingHint:
      "The system will try to extract email, password, and 2FA secret from noisy input and reshape everything into the same 3-part format.",
    shortcutHint:
      "Bulk paste is supported. Press Cmd/Ctrl + Enter in the left editor to start conversion.",
  },
  vi: {
    tool: "Chuyen Doi",
    title: "Cong Cu Chuyen Doi Tai Khoan",
    description:
      "Gui van ban tuy y, JSON, CSV, du lieu bang hoac ghi chu vao LLM de chuan hoa thanh Email---Password---2FA key.",
    input: "Du Lieu Goc",
    output: "Du Lieu Chuan Hoa",
    inputPlaceholder:
      "Dan noi dung tai khoan vao day.\n\nHo tro nhieu dinh dang, vi du:\n- JSON / CSV / van ban\n- URL otpauth://\n- ghi chu co chu thich\n- danh sach nhieu tai khoan",
    outputPlaceholder:
      "Ket qua se duoc xuat moi dong 1 tai khoan theo dinh dang Email---Password---2FA key.",
    convert: "Chuyen Doi",
    converting: "Dang Chuyen...",
    clear: "Xoa",
    copy: "Sao Chep Ket Qua",
    copied: "Da Sao Chep",
    copyFailed: "Sao Chep That Bai",
    emptyInput: "Vui long nhap noi dung can chuyen doi.",
    requestFailed: "Yeu cau chuyen doi that bai",
    noMatch: "Chua nhan dien duoc tai khoan email phu hop.",
    convertedCount: "Da chuan hoa {count} tai khoan",
    privacyHint:
      "Noi dung se duoc gui toi dich vu LLM da cau hinh de sap xep lai. Khong dan du lieu can giu noi bo.",
    workingHint:
      "He thong se co gang tach email, mat khau va khoa 2FA tu du lieu lon xon va dua ve mot dinh dang 3 phan thong nhat.",
    shortcutHint:
      "Ho tro dan nhieu tai khoan cung luc. Nhan Cmd/Ctrl + Enter trong o ben trai de chuyen doi ngay.",
  },
} as const;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FormatConverterDropdown() {
  const { language } = useUiPreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const copy = language === "zh" ? COPY.zh : language === "vi" ? COPY.vi : COPY.en;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyFeedback(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copyFeedback]);

  const handleConvert = () => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setError(copy.emptyInput);
      setMessage(null);
      setOutput("");
      setLineCount(0);
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        setMessage(null);

        const response = await fetch("/api/format-convert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ui-language": language,
          },
          body: JSON.stringify({ input: trimmedInput }),
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as FormatConvertResponse;

        if (!response.ok) {
          throw new Error(payload.detail || `${copy.requestFailed} (HTTP ${response.status})`);
        }

        setOutput(payload.normalizedText || "");
        setLineCount(payload.lineCount || 0);
        setMessage(
          (payload.lineCount || 0) > 0
            ? copy.convertedCount.replace("{count}", String(payload.lineCount || 0))
            : copy.noMatch
        );
      } catch (nextError) {
        setOutput("");
        setLineCount(0);
        setMessage(null);
        setError(nextError instanceof Error ? nextError.message : copy.requestFailed);
      }
    });
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
    setLineCount(0);
    setMessage(null);
    setError(null);
    setCopyFeedback(null);
  };

  const handleCopy = async () => {
    if (!output.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("failed");
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={classNames("control-dropdown formatter-dropdown", isOpen && "control-dropdown-open")}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={copy.title}
        onClick={() => setIsOpen((value) => !value)}
        className="control-dropdown-trigger"
      >
        <span>{copy.tool}</span>
        <span
          className={classNames("control-dropdown-caret", isOpen && "control-dropdown-caret-open")}
        />
      </button>

      {isOpen ? (
        <div className="control-dropdown-panel formatter-dropdown-panel" role="dialog" aria-label={copy.title}>
          <div className="formatter-panel-header">
            <div className="min-w-0">
              <p className="formatter-panel-kicker">{copy.tool}</p>
              <h3 className="formatter-panel-title">{copy.title}</h3>
              <p className="formatter-panel-description">{copy.description}</p>
            </div>

            <div className="formatter-toolbar">
              <button
                type="button"
                onClick={handleClear}
                className="theme-button-surface"
              >
                {copy.clear}
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={isPending}
                className={classNames(isPending ? "theme-button-disabled" : "theme-button-primary")}
              >
                {isPending ? copy.converting : copy.convert}
              </button>
            </div>
          </div>

          <div className="notice notice-success">{copy.workingHint}</div>
          <p className="formatter-panel-footnote">{copy.shortcutHint}</p>

          {message ? <div className="notice notice-success">{message}</div> : null}
          {error ? <div className="notice notice-error">{error}</div> : null}

          <div className="formatter-panel-grid">
            <label className="formatter-panel-card">
              <span className="formatter-panel-label">{copy.input}</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleConvert();
                  }
                }}
                placeholder={copy.inputPlaceholder}
                spellCheck={false}
                className="formatter-panel-textarea"
              />
            </label>

            <div className="formatter-panel-card">
              <div className="formatter-output-header">
                <span className="formatter-panel-label">{copy.output}</span>
                <div className="formatter-toolbar">
                  <span className="formatter-count-pill">{lineCount}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!output.trim()}
                    className={classNames(
                      output.trim() ? "theme-button-secondary" : "theme-button-disabled"
                    )}
                  >
                    {copyFeedback === "copied"
                      ? copy.copied
                      : copyFeedback === "failed"
                        ? copy.copyFailed
                        : copy.copy}
                  </button>
                </div>
              </div>

              <textarea
                readOnly
                value={output}
                placeholder={copy.outputPlaceholder}
                spellCheck={false}
                className="formatter-panel-textarea formatter-panel-textarea-readonly"
              />
            </div>
          </div>

          <p className="formatter-panel-footnote">{copy.privacyHint}</p>
        </div>
      ) : null}
    </div>
  );
}
