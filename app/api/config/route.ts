import { NextResponse } from "next/server";

import { WebSaleApiError, buildConfigPayload } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await buildConfigPayload());
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
