import { NextRequest, NextResponse } from "next/server";

import { createBufferedNoticeStream, readPreparedNoticeMarkdown } from "@/lib/notice-translation";
import { isSupportedLanguage, type Language } from "@/lib/ui-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TranslationPayload = {
  targetLanguage?: Language;
};

function resolveRouteLanguage(request: NextRequest) {
  const language = request.headers.get("x-ui-language");
  return language === "zh" ? "zh" : "en";
}

export async function POST(request: NextRequest) {
  const routeLanguage = resolveRouteLanguage(request);

  try {
    const payload = (await request.json().catch(() => null)) as TranslationPayload | null;
    const targetLanguage = isSupportedLanguage(payload?.targetLanguage) ? payload.targetLanguage : null;

    if (!targetLanguage) {
      return NextResponse.json(
        { detail: routeLanguage === "en" ? "Target language is required." : "缺少目标语言。" },
        { status: 400 }
      );
    }

    const prepared = await readPreparedNoticeMarkdown(targetLanguage);
    const stream = createBufferedNoticeStream(prepared.markdown);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-notice-content-language": prepared.contentLanguage,
        "x-notice-translation-status": prepared.status,
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message
        ? error.message
        : routeLanguage === "en"
          ? "Unexpected translation error."
          : "翻译服务异常。";

    return NextResponse.json({ detail }, { status: 500 });
  }
}
