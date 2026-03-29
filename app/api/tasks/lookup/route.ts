import { NextResponse } from "next/server";

import { WebSaleApiError, fetchQueuedTasks } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      task_ids?: number[];
    } | null;

    return NextResponse.json(
      await fetchQueuedTasks(Array.isArray(payload?.task_ids) ? payload.task_ids : [])
    );
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
