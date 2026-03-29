import { NextResponse } from "next/server";

import { WebSaleApiError, fetchQueuedTask, previewExchange } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ taskId: string }>;
  }
) {
  try {
    const { taskId } = await context.params;
    const parsedTaskId = Number(taskId);
    if (!Number.isFinite(parsedTaskId) || parsedTaskId <= 0) {
      return NextResponse.json({ detail: "Invalid task id." }, { status: 400 });
    }

    const payload = await fetchQueuedTask(parsedTaskId);
    const detail = payload.task.cdk_code ? await previewExchange(payload.task.cdk_code) : null;

    return NextResponse.json({
      ...payload,
      detail: detail?.detail ?? null,
    });
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
