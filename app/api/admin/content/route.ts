import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_NOTICE_COOKIE_NAME,
  isAdminNoticeSessionValid,
  readNoticeMarkdown,
  writeNoticeMarkdown,
} from "@/lib/notice-board";
import { queueNoticeTranslationCopies } from "@/lib/notice-translation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ContentPayload = {
  markdown?: string;
};

function resolveRouteLanguage(request: NextRequest) {
  const language = request.headers.get("x-ui-language");
  return language === "zh" ? "zh" : "en";
}

function isAuthorized(request: NextRequest) {
  return isAdminNoticeSessionValid(request.cookies.get(ADMIN_NOTICE_COOKIE_NAME)?.value);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unauthorized." : "未授权。" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    markdown: await readNoticeMarkdown(),
  });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unauthorized." : "未授权。" },
      { status: 401 }
    );
  }

  try {
    const payload = (await request.json().catch(() => null)) as ContentPayload | null;
    const markdown = typeof payload?.markdown === "string" ? payload.markdown : null;

    if (markdown === null) {
      return NextResponse.json(
        { detail: resolveRouteLanguage(request) === "en" ? "Markdown content is required." : "缺少 Markdown 内容。" },
        { status: 400 }
      );
    }

    await writeNoticeMarkdown("zh", markdown);
    await queueNoticeTranslationCopies(markdown);
    return NextResponse.json({
      markdown: await readNoticeMarkdown(),
      translationQueued: true,
    });
  } catch {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unexpected server error." : "服务器异常。" },
      { status: 500 }
    );
  }
}
