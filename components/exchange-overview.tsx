"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useUiPreferences } from "@/components/ui-preferences-provider";

type ActiveActivityTone = "success" | "failure" | "queued" | "running";
type EmptyActivityTone = "empty";
type ActivityTone = ActiveActivityTone | EmptyActivityTone;

type ActiveActivityCell = {
  taskId: number | null;
  tone: ActiveActivityTone;
};

type ActivityCell = ActiveActivityCell | { taskId: null; tone: EmptyActivityTone };

type OverviewActivityCell = {
  task_id?: number;
  tone?: ActiveActivityTone;
};

type OverviewActivityDay = {
  date: string;
  queued?: number;
  running?: number;
  success?: number;
  failed?: number;
  cancelled?: number;
  total?: number;
  cells?: OverviewActivityCell[];
};

type NormalizedOverviewActivityDay = {
  date: string;
  queued: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  total: number;
  cells: ActiveActivityCell[];
};

type OverviewResponse = {
  generated_at?: string;
  counts?: {
    tasks_queued?: number;
    tasks_running?: number;
    tasks_success?: number;
    tasks_failed?: number;
  };
  activity?: {
    days?: OverviewActivityDay[];
  };
};

const HEATMAP_ROWS = 6;
const HEATMAP_CARD_PADDING_REM = 0.75;
const HEATMAP_SECTION_GAP_REM = 0.75;
const HEATMAP_CELL_GAP_REM = 0.375;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function asCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function isActiveActivityTone(value: unknown): value is ActiveActivityTone {
  return (
    value === "success" ||
    value === "failure" ||
    value === "queued" ||
    value === "running"
  );
}

function asTaskId(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function normalizeActivityCell(cell: OverviewActivityCell): ActiveActivityCell | null {
  if (!cell || !isActiveActivityTone(cell.tone)) {
    return null;
  }

  return {
    taskId: asTaskId(cell.task_id),
    tone: cell.tone,
  };
}

function createEmptyActivityDay(date: string): NormalizedOverviewActivityDay {
  return {
    date,
    queued: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
    cells: [],
  };
}

function normalizeActivityDay(day: OverviewActivityDay): NormalizedOverviewActivityDay {
  return {
    date: day.date,
    queued: asCount(day.queued),
    running: asCount(day.running),
    success: asCount(day.success),
    failed: asCount(day.failed),
    cancelled: asCount(day.cancelled),
    total: asCount(day.total),
    cells: Array.isArray(day.cells)
      ? day.cells
          .map((cell) => normalizeActivityCell(cell))
          .filter((cell): cell is ActiveActivityCell => Boolean(cell))
      : [],
  };
}

function resolveToneColor(tone: ActivityTone) {
  if (tone === "success") {
    return "var(--activity-success-3)";
  }
  if (tone === "failure") {
    return "var(--activity-failure-3)";
  }
  if (tone === "queued") {
    return "var(--activity-queued-3)";
  }
  if (tone === "running") {
    return "var(--activity-running-3)";
  }
  return "var(--activity-empty)";
}

function resolveHeatmapColumns(availableWidth: number) {
  const width = Math.max(0, availableWidth);

  if (width >= 980) {
    return 20;
  }
  if (width >= 860) {
    return 19;
  }
  if (width >= 740) {
    return 17;
  }
  if (width >= 620) {
    return 15;
  }
  if (width >= 500) {
    return 13;
  }

  return 11;
}

function resolveBalancedHeatmapLayout(
  contentWidth: number,
  availableGridHeight: number,
  cellGap: number,
  fallbackColumns: number
) {
  for (let columnCount = Math.max(HEATMAP_ROWS + 1, fallbackColumns); columnCount <= 80; columnCount += 1) {
    const dimensionDelta = columnCount - HEATMAP_ROWS;
    const cellSize =
      (contentWidth - availableGridHeight - cellGap * dimensionDelta) / dimensionDelta;

    if (cellSize <= 0) {
      continue;
    }

    const horizontalInset =
      (contentWidth - columnCount * cellSize - cellGap * (columnCount - 1)) / 2;
    const verticalInset =
      (availableGridHeight - HEATMAP_ROWS * cellSize - cellGap * (HEATMAP_ROWS - 1)) / 2;

    if (horizontalInset >= 0 && verticalInset >= 0) {
      return {
        columns: columnCount,
        cellSizePx: cellSize,
        gridHeightPx: availableGridHeight,
      };
    }
  }

  return {
    columns: fallbackColumns,
    cellSizePx: null,
    gridHeightPx: null,
  };
}

function buildTodayCells(
  orderedCells: ActiveActivityCell[],
  successCount: number,
  failureCount: number,
  queuedCount: number,
  runningCount: number,
  slotCount: number
) {
  const coloredCells =
    orderedCells.length > 0
      ? orderedCells
      : [
          ...Array.from({ length: successCount }, () => ({ taskId: null, tone: "success" as const })),
          ...Array.from({ length: failureCount }, () => ({ taskId: null, tone: "failure" as const })),
          ...Array.from({ length: queuedCount }, () => ({ taskId: null, tone: "queued" as const })),
          ...Array.from({ length: runningCount }, () => ({ taskId: null, tone: "running" as const })),
        ];
  const minimumSlots = Math.max(0, slotCount);
  const visibleColoredCells = coloredCells.slice(0, minimumSlots);

  return {
    cells: [
      ...visibleColoredCells,
      ...Array.from(
        { length: Math.max(0, minimumSlots - visibleColoredCells.length) },
        () => ({ taskId: null, tone: "empty" as const })
      ),
    ],
    overflowCount: Math.max(0, coloredCells.length - minimumSlots),
  };
}

function buildColumnMajorDisplayCells(cells: ActivityCell[], rows: number, columns: number) {
  const normalizedRows = Math.max(1, rows);
  const normalizedColumns = Math.max(1, columns);
  const slotCount = normalizedRows * normalizedColumns;

  return Array.from({ length: slotCount }, (_, index) => {
    const row = Math.floor(index / normalizedColumns);
    const column = index % normalizedColumns;
    const sourceIndex = column * normalizedRows + row;
    return cells[sourceIndex] ?? { taskId: null, tone: "empty" as const };
  });
}

export function ExchangeOverview() {
  const { language } = useUiPreferences();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heatmapColumns, setHeatmapColumns] = useState(12);
  const [heatmapCellSizePx, setHeatmapCellSizePx] = useState<number | null>(null);
  const [heatmapGridHeightPx, setHeatmapGridHeightPx] = useState<number | null>(null);
  const heatmapCardRef = useRef<HTMLElement | null>(null);
  const heatmapHeaderRef = useRef<HTMLDivElement | null>(null);

  const copy =
    language === "zh"
      ? {
          requestFailed: "请求失败",
          loadFailed: "概览加载失败。",
          runningTasks: "运行中任务",
          queuedTasks: "排队任务",
          successTasks: "成功任务",
          failedTasks: "失败任务",
          todaySummary: "今天成功 {success} 次，失败 {failed} 次，处理中 {running} 个，排队 {queued} 个。",
          noActivity: "今天还没有任务结果。",
          successLegend: "成功",
          failureLegend: "失败",
          runningLegend: "处理中",
          queuedLegend: "排队中",
          queueTaskLabel: "队列任务",
          totalLabel: "今日总数",
          overflowLabel: "更多",
        }
      : {
          requestFailed: "Request failed",
          loadFailed: "Failed to load overview.",
          runningTasks: "Running Tasks",
          queuedTasks: "Queued Tasks",
          successTasks: "Successful Tasks",
          failedTasks: "Failed Tasks",
          todaySummary: "Today: {success} successes, {failed} failures, {running} in progress, {queued} queued.",
          noActivity: "No task results yet today.",
          successLegend: "Success",
          failureLegend: "Failure",
          runningLegend: "Running",
          queuedLegend: "Queued",
          queueTaskLabel: "Task",
          totalLabel: "Today Total",
          overflowLabel: "More",
        };

  useEffect(() => {
    const card = heatmapCardRef.current;
    if (!card) {
      return;
    }

    const applyColumns = () => {
      const rootFontSize =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const cardPadding = HEATMAP_CARD_PADDING_REM * rootFontSize;
      const sectionGap = HEATMAP_SECTION_GAP_REM * rootFontSize;
      const cellGap = HEATMAP_CELL_GAP_REM * rootFontSize;
      const headerHeight = heatmapHeaderRef.current?.getBoundingClientRect().height || 0;
      const { width: cardWidth, height: cardHeight } = card.getBoundingClientRect();
      const contentWidth = Math.max(0, cardWidth - cardPadding * 2);
      const contentHeight = Math.max(0, cardHeight - cardPadding * 2);
      const availableGridHeight = Math.max(0, contentHeight - headerHeight - sectionGap);
      const widthBasedColumns = resolveHeatmapColumns(contentWidth);
      const isLargeViewport = window.innerWidth >= 1024;

      if (availableGridHeight <= 0 || !isLargeViewport) {
        setHeatmapColumns(widthBasedColumns);
        setHeatmapCellSizePx(null);
        setHeatmapGridHeightPx(null);
        return;
      }

      const balancedLayout = resolveBalancedHeatmapLayout(
        contentWidth,
        availableGridHeight,
        cellGap,
        widthBasedColumns
      );

      setHeatmapColumns(balancedLayout.columns);
      setHeatmapCellSizePx(balancedLayout.cellSizePx);
      setHeatmapGridHeightPx(balancedLayout.gridHeightPx);
    };

    applyColumns();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      applyColumns();
    });

    observer.observe(card);
    if (heatmapHeaderRef.current) {
      observer.observe(heatmapHeaderRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      try {
        const response = await fetch("/api/overview", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as OverviewResponse & {
          detail?: string;
        };
        if (!response.ok) {
          throw new Error(payload.detail || `${copy.requestFailed} (HTTP ${response.status})`);
        }
        if (cancelled) {
          return;
        }
        setOverview(payload);
        setError(null);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : copy.loadFailed);
      }
    };

    void loadOverview();
    const timer = window.setInterval(() => {
      void loadOverview();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [copy.loadFailed, copy.requestFailed]);

  const normalizedActivityDays = useMemo(
    () =>
      Array.isArray(overview?.activity?.days)
        ? overview.activity.days
            .filter((day): day is OverviewActivityDay => typeof day?.date === "string" && day.date.length > 0)
            .map((day) => normalizeActivityDay(day))
        : [],
    [overview?.activity?.days]
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayActivity =
    normalizedActivityDays.find((day) => day.date === todayKey) || createEmptyActivityDay(todayKey);
  const failureCount = todayActivity.failed + todayActivity.cancelled;
  const totalCount = todayActivity.total;
  const heatmapRows = HEATMAP_ROWS;
  const todayCells = buildTodayCells(
    todayActivity.cells,
    todayActivity.success,
    failureCount,
    todayActivity.queued,
    todayActivity.running,
    heatmapColumns * heatmapRows
  );
  const displayCells = buildColumnMajorDisplayCells(todayCells.cells, heatmapRows, heatmapColumns);
  const heatmapGridStyle =
    heatmapCellSizePx && heatmapGridHeightPx
      ? {
          height: `${heatmapGridHeightPx}px`,
          gridTemplateColumns: `repeat(${heatmapColumns}, ${heatmapCellSizePx}px)`,
          gridAutoRows: `${heatmapCellSizePx}px`,
          justifyContent: "center" as const,
          alignContent: "center" as const,
        }
      : {
          gridTemplateColumns: `repeat(${heatmapColumns}, minmax(0, 1fr))`,
        };

  const items = [
    {
      label: copy.runningTasks,
      value: todayActivity.running,
    },
    {
      label: copy.queuedTasks,
      value: todayActivity.queued,
    },
    {
      label: copy.successTasks,
      value: todayActivity.success,
    },
    {
      label: copy.failedTasks,
      value: todayActivity.failed,
    },
  ];

  return (
    <div className="grid w-full gap-3 p-3 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-stretch">
      <div className="grid auto-rows-max content-start self-start gap-3 sm:grid-cols-2 lg:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.label}
            className="surface-card aspect-square rounded-[1.4rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,246,0.74)] p-4 shadow-[0_18px_36px_rgba(70,52,24,0.08)]"
          >
            <div className="flex h-full flex-col justify-between">
              <div className="text-[0.88rem] font-semibold tracking-[0.04em] text-[var(--muted)]">
                {item.label}
              </div>
              <div className="text-[3rem] font-semibold leading-none tracking-[-0.06em] text-[var(--accent-deep)]">
                {typeof item.value === "number" ? item.value : "—"}
              </div>
            </div>
          </article>
        ))}
      </div>

      <article
        ref={heatmapCardRef}
        className="surface-card flex w-full min-w-0 flex-col gap-3 rounded-[1.4rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,246,0.74)] p-3 shadow-[0_18px_36px_rgba(70,52,24,0.08)] lg:h-[20rem]"
      >
        <div
          ref={heatmapHeaderRef}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tracking-[0.08em] text-[var(--muted)]">
            {[
              { tone: "success" as const, label: copy.successLegend },
              { tone: "failure" as const, label: copy.failureLegend },
              { tone: "running" as const, label: copy.runningLegend },
              { tone: "queued" as const, label: copy.queuedLegend },
            ].map((legend) => (
              <span key={legend.label} className="inline-flex items-center gap-2">
                <span
                  className="activity-legend-swatch"
                  style={{ backgroundColor: resolveToneColor(legend.tone) }}
                />
                {legend.label}
              </span>
            ))}
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {copy.totalLabel}: {totalCount}
            {todayCells.overflowCount ? ` · +${todayCells.overflowCount} ${copy.overflowLabel}` : ""}
          </div>
        </div>

        <div
          className="grid gap-[0.375rem]"
          style={heatmapGridStyle}
        >
          {displayCells.map((cell, index) => {
            const tooltip = cell.taskId !== null ? `${copy.queueTaskLabel} #${cell.taskId}` : undefined;

            return (
              <div
                key={`${todayActivity.date}-${index}`}
                className={classNames(
                  "activity-cell",
                  cell.tone !== "empty" && "activity-cell-active"
                )}
                title={tooltip}
                aria-label={tooltip}
                style={{
                  backgroundColor: resolveToneColor(cell.tone),
                  width: "100%",
                  height: "auto",
                  aspectRatio: "1 / 1",
                }}
              />
            );
          })}
        </div>
      </article>

      {error ? (
        <div className="rounded-[1.15rem] border border-[rgba(179,79,59,0.16)] bg-[rgba(179,79,59,0.08)] px-4 py-3 text-sm leading-6 text-[#973d2c] lg:col-span-2">
          {error}
        </div>
      ) : null}
    </div>
  );
}
