import { NextResponse } from "next/server";

import { WebSaleApiError, previewExchange } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as { code?: string } | null;
    const code = typeof payload?.code === "string" ? payload.code : "";
    return NextResponse.json(await previewExchange(code));
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
