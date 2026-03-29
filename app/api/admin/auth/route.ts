import { NextResponse } from "next/server";

import {
  ADMIN_NOTICE_COOKIE_MAX_AGE_SECONDS,
  ADMIN_NOTICE_COOKIE_NAME,
  getAdminNoticeSessionValue,
  isAdminNoticePasswordValid,
  readNoticeMarkdown,
} from "@/lib/notice-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AuthPayload = {
  password?: string;
};

function resolveRouteLanguage(request: Request) {
  const language = request.headers.get("x-ui-language");
  return language === "zh" ? "zh" : "en";
}

export async function POST(request: Request) {
  try {
    const language = resolveRouteLanguage(request);
    const payload = (await request.json().catch(() => null)) as AuthPayload | null;
    const password = typeof payload?.password === "string" ? payload.password : "";

    if (!isAdminNoticePasswordValid(password)) {
      return NextResponse.json(
        { detail: language === "en" ? "Incorrect password." : "密码错误。" },
        { status: 401 }
      );
    }

    const markdown = await readNoticeMarkdown();
    const response = NextResponse.json({
      authenticated: true,
      markdown,
    });

    response.cookies.set({
      name: ADMIN_NOTICE_COOKIE_NAME,
      value: getAdminNoticeSessionValue(),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_NOTICE_COOKIE_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json(
      { detail: resolveRouteLanguage(request) === "en" ? "Unexpected server error." : "服务器异常。" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: ADMIN_NOTICE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
