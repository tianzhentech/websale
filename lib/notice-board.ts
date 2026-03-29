import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readServerEnv } from "@/lib/server-env";

export const ADMIN_NOTICE_COOKIE_NAME = "pixel_websale_admin_notice";
export const ADMIN_NOTICE_PASSWORD_ENV = "PIXEL_WEBSALE_ADMIN_PASSWORD";
export const SHARED_ADMIN_PASSWORD_ENV = "PIXEL_ADMIN_PASSWORD";
export const DEFAULT_ADMIN_NOTICE_PASSWORD = "123456";
export const ADMIN_NOTICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

export const NOTICE_SOURCE_LANGUAGE = "zh";
export const NOTICE_TRANSLATION_LANGUAGES = ["en", "vi"] as const;
export const NOTICE_LANGUAGES = [NOTICE_SOURCE_LANGUAGE, ...NOTICE_TRANSLATION_LANGUAGES] as const;

export type NoticeLanguage = (typeof NOTICE_LANGUAGES)[number];
export type NoticeTranslationLanguage = (typeof NOTICE_TRANSLATION_LANGUAGES)[number];

const NOTICE_CONTENT_DIR = path.join(process.cwd(), "content");
const LEGACY_NOTICE_CONTENT_FILE = path.join(NOTICE_CONTENT_DIR, "notice-board.md");

const NOTICE_CONTENT_FILES: Record<NoticeLanguage, string> = {
  zh: path.join(NOTICE_CONTENT_DIR, "notice-board.zh.md"),
  en: path.join(NOTICE_CONTENT_DIR, "notice-board.en.md"),
  vi: path.join(NOTICE_CONTENT_DIR, "notice-board.vi.md"),
};

const DEFAULT_NOTICE_MARKDOWN: Record<NoticeLanguage, string> = {
  zh: `## 使用说明

> **核心账号安全警告**  
> 任务完成后，请第一时间修改密码与 TOTP 密钥，避免账号继续暴露在自动化流程里。

> **操作提醒**  
> 1. 提交前请确认 CDK 额度和账号信息无误。  
> 2. 任务失败时请先查看原因，再决定是否重新排队。  
> 3. 如遇网络波动，可稍后刷新页面后重试。
`,
  en: `## Instructions

> **Core Account Security Warning**  
> Once a task is finished, change the password and TOTP key immediately so the account does not remain exposed to the automation flow.

> **Operation Notes**  
> 1. Confirm the CDK balance and account details before submitting.  
> 2. If a task fails, review the reason first before deciding whether to queue it again.  
> 3. If the network is unstable, refresh the page later and try again.
`,
  vi: `## Huong dan

> **Canh bao an toan tai khoan quan trong**  
> Sau khi tac vu hoan thanh, hay doi mat khau va khoa TOTP ngay lap tuc de tranh tai khoan tiep tuc bi lo trong quy trinh tu dong hoa.

> **Luu y thao tac**  
> 1. Hay xac nhan so du CDK va thong tin tai khoan truoc khi gui.  
> 2. Neu tac vu that bai, hay kiem tra nguyen nhan truoc khi quyet dinh xep hang lai.  
> 3. Neu mang khong on dinh, hay tai lai trang sau do thu lai.
`,
};

function buildDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeNoticeMarkdown(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n").trim();
}

function formatPersistedNoticeMarkdown(markdown: string) {
  const normalized = normalizeNoticeMarkdown(markdown);
  return normalized ? `${normalized}\n` : "";
}

export function buildNoticeMarkdownDigest(markdown: string) {
  return buildDigest(normalizeNoticeMarkdown(markdown));
}

export function resolveAdminNoticePassword() {
  return (
    readServerEnv(SHARED_ADMIN_PASSWORD_ENV) ||
    readServerEnv(ADMIN_NOTICE_PASSWORD_ENV) ||
    DEFAULT_ADMIN_NOTICE_PASSWORD
  );
}

export function getAdminNoticeSessionValue() {
  return buildDigest(`pixel-websale-admin-session:${resolveAdminNoticePassword()}`);
}

export function isAdminNoticePasswordValid(password: string) {
  return safeCompare(buildDigest(password.trim()), buildDigest(resolveAdminNoticePassword()));
}

export function isAdminNoticeSessionValid(value?: string | null) {
  if (!value) {
    return false;
  }
  return safeCompare(value, getAdminNoticeSessionValue());
}

export function resolveNoticeContentFile(language: NoticeLanguage) {
  return NOTICE_CONTENT_FILES[language];
}

async function ensureNoticeContentFile(language: NoticeLanguage) {
  await mkdir(NOTICE_CONTENT_DIR, { recursive: true });
  const noticeContentFile = resolveNoticeContentFile(language);

  try {
    await readFile(noticeContentFile, "utf8");
  } catch {
    if (language === NOTICE_SOURCE_LANGUAGE) {
      try {
        const legacyMarkdown = await readFile(LEGACY_NOTICE_CONTENT_FILE, "utf8");
        await writeFile(noticeContentFile, formatPersistedNoticeMarkdown(legacyMarkdown), "utf8");
        return;
      } catch {
        // Fall through to the default localized seed content.
      }
    }

    await writeFile(noticeContentFile, formatPersistedNoticeMarkdown(DEFAULT_NOTICE_MARKDOWN[language]), "utf8");
  }
}

export async function ensureNoticeContentFiles() {
  await Promise.all(NOTICE_LANGUAGES.map((language) => ensureNoticeContentFile(language)));
}

export async function readNoticeMarkdown(language: NoticeLanguage = NOTICE_SOURCE_LANGUAGE) {
  await ensureNoticeContentFile(language);
  return readFile(resolveNoticeContentFile(language), "utf8");
}

export async function readAllNoticeMarkdown() {
  const entries = await Promise.all(
    NOTICE_LANGUAGES.map(async (language) => [language, await readNoticeMarkdown(language)] as const)
  );

  return Object.fromEntries(entries) as Record<NoticeLanguage, string>;
}

export async function writeNoticeMarkdown(language: NoticeLanguage, markdown: string) {
  await mkdir(NOTICE_CONTENT_DIR, { recursive: true });
  await writeFile(resolveNoticeContentFile(language), formatPersistedNoticeMarkdown(markdown), "utf8");
}
