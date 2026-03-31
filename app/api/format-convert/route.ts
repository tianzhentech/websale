import { NextRequest, NextResponse } from "next/server";

import {
  MAX_FORMAT_CONVERTER_INPUT_LENGTH,
  convertAccountFormat,
} from "@/lib/format-converter";
import { isSupportedLanguage, type Language } from "@/lib/ui-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FormatConvertPayload = {
  input?: string;
};

const COPY = {
  zh: {
    inputRequired: "请先输入要转换的内容。",
    inputTooLong: `输入内容过长，请控制在 ${MAX_FORMAT_CONVERTER_INPUT_LENGTH} 个字符以内。`,
    unexpectedError: "格式转换服务异常。",
  },
  en: {
    inputRequired: "Please enter content to convert.",
    inputTooLong: `Input is too long. Please keep it within ${MAX_FORMAT_CONVERTER_INPUT_LENGTH} characters.`,
    unexpectedError: "Unexpected format conversion error.",
  },
  vi: {
    inputRequired: "Vui long nhap noi dung can chuyen doi.",
    inputTooLong: `Noi dung qua dai. Vui long gioi han trong ${MAX_FORMAT_CONVERTER_INPUT_LENGTH} ky tu.`,
    unexpectedError: "Dich vu chuyen doi dinh dang gap loi.",
  },
} as const;

function resolveRouteLanguage(request: NextRequest): Language {
  const language = request.headers.get("x-ui-language");
  return isSupportedLanguage(language) ? language : "zh";
}

export async function POST(request: NextRequest) {
  const language = resolveRouteLanguage(request);
  const copy = COPY[language];

  try {
    const payload = (await request.json().catch(() => null)) as FormatConvertPayload | null;
    const input = typeof payload?.input === "string" ? payload.input : "";
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return NextResponse.json({ detail: copy.inputRequired }, { status: 400 });
    }

    if (trimmedInput.length > MAX_FORMAT_CONVERTER_INPUT_LENGTH) {
      return NextResponse.json({ detail: copy.inputTooLong }, { status: 400 });
    }

    const result = await convertAccountFormat(trimmedInput);
    return NextResponse.json({
      normalizedLines: result.normalizedLines,
      normalizedText: result.normalizedText,
      lineCount: result.normalizedLines.length,
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? error.message : copy.unexpectedError;

    return NextResponse.json({ detail }, { status: 500 });
  }
}
