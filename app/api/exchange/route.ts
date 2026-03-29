import { NextResponse } from "next/server";

import { WebSaleApiError, queueBatchExchangeTasks, queueExchangeTask } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      code?: string;
      run_mode?: "extract_link" | "subscription";
      account_mode?: "single" | "bulk";
      email?: string;
      password?: string;
      twofa_url?: string;
      bulk_text?: string;
    } | null;

    const code = typeof payload?.code === "string" ? payload.code : "";
    const runMode = payload?.run_mode;
    const accountMode = payload?.account_mode;
    const email = typeof payload?.email === "string" ? payload.email : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const twofaUrl = typeof payload?.twofa_url === "string" ? payload.twofa_url : "";
    const bulkText = typeof payload?.bulk_text === "string" ? payload.bulk_text : "";
    const resolvedAccountMode =
      accountMode === "bulk"
        ? "bulk"
        : accountMode === "single"
          ? "single"
          : bulkText.trim()
            ? "bulk"
            : "single";

    if (runMode !== "extract_link" && runMode !== "subscription") {
      return NextResponse.json({ detail: "Unsupported run mode." }, { status: 400 });
    }

    if (resolvedAccountMode === "bulk") {
      return NextResponse.json(
        await queueBatchExchangeTasks({
          code,
          runMode,
          bulkText,
        })
      );
    }

    return NextResponse.json(await queueExchangeTask({ code, runMode, email, password, twofaUrl }));
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
