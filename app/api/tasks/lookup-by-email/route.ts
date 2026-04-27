import { NextResponse } from "next/server";

import { WebSaleApiError, fetchQueuedTasksByEmail } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      cdk_code?: string;
      emails?: string[];
    } | null;

    return NextResponse.json(
      await fetchQueuedTasksByEmail({
        cdkCode: typeof payload?.cdk_code === "string" ? payload.cdk_code : "",
        emails: Array.isArray(payload?.emails) ? payload.emails : [],
      })
    );
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
