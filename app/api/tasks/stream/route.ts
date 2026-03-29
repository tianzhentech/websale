import { NextResponse } from "next/server";

import { WebSaleApiError, openQueuedTaskStream } from "@/lib/websale-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseTaskIds(searchParams: URLSearchParams) {
  const rawTaskIds = [
    ...searchParams.getAll("task_id"),
    ...searchParams
      .getAll("task_ids")
      .flatMap((value) => value.split(",")),
  ];

  const taskIds: number[] = [];
  const seen = new Set<number>();
  for (const rawValue of rawTaskIds) {
    const taskId = Number(rawValue);
    if (!Number.isFinite(taskId) || taskId <= 0 || seen.has(taskId)) {
      continue;
    }
    seen.add(taskId);
    taskIds.push(taskId);
  }
  return taskIds;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskIds = parseTaskIds(searchParams);
    if (!taskIds.length) {
      return NextResponse.json({ detail: "At least one task id is required." }, { status: 400 });
    }

    const upstream = await openQueuedTaskStream(taskIds, request.signal);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof WebSaleApiError) {
      return NextResponse.json({ detail: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ detail: "Unexpected server error." }, { status: 500 });
  }
}
