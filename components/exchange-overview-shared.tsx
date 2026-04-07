"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Language } from "@/lib/ui-language";

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
    window_minutes?: number;
    days?: OverviewActivityDay[];
    totals?: {
      queued?: number;
      running?: number;
      success?: number;
      failed?: number;
      cancelled?: number;
      total?: number;
    };
  };
};

export type OverviewActivityTotals = {
  queued: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  total: number;
};

type OverviewCopy = {
  requestFailed: string;
  loadFailed: string;
  runningTasks: string;
  queuedTasks: string;
  successTasks: string;
  failedTasks: string;
  successLegend: string;
  failureLegend: string;
  runningLegend: string;
  queuedLegend: string;
  queueTaskLabel: string;
  totalLabel: string;
  overflowLabel: string;
};

export type ExchangeOverviewSnapshot = {
  copy: OverviewCopy;
  error: string | null;
  taskCounts: {
    running: number;
    queued: number;
    success: number;
    failed: number;
  };
  activityTotals: OverviewActivityTotals;
  activityWindowMinutes: number;
  totalCount: number;
  windowCells: ActiveActivityCell[];
};

const DEFAULT_HEATMAP_ROWS = 6;
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

export function resolveToneColor(tone: ActivityTone) {
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
  fallbackColumns: number,
  rows: number
) {
  for (let columnCount = Math.max(rows + 1, fallbackColumns); columnCount <= 80; columnCount += 1) {
    const dimensionDelta = columnCount - rows;
    const cellSize =
      (contentWidth - availableGridHeight - cellGap * dimensionDelta) / dimensionDelta;

    if (cellSize <= 0) {
      continue;
    }

    const horizontalInset =
      (contentWidth - columnCount * cellSize - cellGap * (columnCount - 1)) / 2;
    const verticalInset =
      (availableGridHeight - rows * cellSize - cellGap * (rows - 1)) / 2;

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
  const visibleColoredCells =
    coloredCells.length > minimumSlots
      ? coloredCells.slice(-minimumSlots)
      : coloredCells;

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

function getOverviewCopy(language: Language): OverviewCopy {
  if (language === "zh") {
    return {
      requestFailed: "请求失败",
      loadFailed: "概览加载失败。",
      runningTasks: "运行中任务",
      queuedTasks: "排队任务",
      successTasks: "成功任务",
      failedTasks: "失败任务",
      successLegend: "成功",
      failureLegend: "失败",
      runningLegend: "处理中",
      queuedLegend: "排队中",
      queueTaskLabel: "队列任务",
      totalLabel: "最近 {minutes} 分钟",
      overflowLabel: "更多",
    };
  }

  return {
    requestFailed: "Request failed",
    loadFailed: "Failed to load overview.",
    runningTasks: "Running Tasks",
    queuedTasks: "Queued Tasks",
    successTasks: "Successful Tasks",
    failedTasks: "Failed Tasks",
    successLegend: "Success",
    failureLegend: "Failure",
    runningLegend: "Running",
    queuedLegend: "Queued",
    queueTaskLabel: "Task",
    totalLabel: "Last {minutes} min",
    overflowLabel: "More",
  };
}

export function useExchangeOverviewSnapshot(language: Language): ExchangeOverviewSnapshot {
  const copy = useMemo(() => getOverviewCopy(language), [language]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const activityWindowMinutes = asCount(overview?.activity?.window_minutes) || 1;
  const activityTotals: OverviewActivityTotals = {
    queued: asCount(overview?.activity?.totals?.queued),
    running: asCount(overview?.activity?.totals?.running),
    success: asCount(overview?.activity?.totals?.success),
    failed: asCount(overview?.activity?.totals?.failed),
    cancelled: asCount(overview?.activity?.totals?.cancelled),
    total: asCount(overview?.activity?.totals?.total),
  };

  return {
    copy,
    error,
    taskCounts: {
      running: activityTotals.running,
      queued: activityTotals.queued,
      success: activityTotals.success,
      failed: activityTotals.failed + activityTotals.cancelled,
    },
    activityTotals,
    activityWindowMinutes,
    totalCount: activityTotals.total,
    windowCells: normalizedActivityDays.flatMap((day) => day.cells),
  };
}

export function OverviewActivityCard({
  snapshot,
  rows = DEFAULT_HEATMAP_ROWS,
  className,
  compact = false,
}: {
  snapshot: ExchangeOverviewSnapshot;
  rows?: number;
  className?: string;
  compact?: boolean;
}) {
  const { copy, error, taskCounts, activityTotals, activityWindowMinutes, windowCells } = snapshot;
  const [heatmapColumns, setHeatmapColumns] = useState(12);
  const [heatmapCellSizePx, setHeatmapCellSizePx] = useState<number | null>(null);
  const [heatmapGridHeightPx, setHeatmapGridHeightPx] = useState<number | null>(null);
  const [heatmapGridWidthPx, setHeatmapGridWidthPx] = useState<number | null>(null);
  const heatmapCardRef = useRef<HTMLElement | null>(null);
  const heatmapHeaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = heatmapCardRef.current;
    if (!card) {
      return;
    }

    const applyColumns = () => {
      const cardStyles = window.getComputedStyle(card);
      const paddingLeft = Number.parseFloat(cardStyles.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(cardStyles.paddingRight) || 0;
      const paddingTop = Number.parseFloat(cardStyles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(cardStyles.paddingBottom) || 0;
      const rootFontSize =
        Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const cellGap = HEATMAP_CELL_GAP_REM * rootFontSize;
      const headerHeight = heatmapHeaderRef.current?.getBoundingClientRect().height || 0;
      const { width: cardWidth, height: cardHeight } = card.getBoundingClientRect();
      const contentWidth = Math.max(0, cardWidth - paddingLeft - paddingRight);
      const contentHeight = Math.max(0, cardHeight - paddingTop - paddingBottom);
      const availableGridHeight = Math.max(0, contentHeight - headerHeight);
      const widthBasedColumns = resolveHeatmapColumns(contentWidth);
      const isLargeViewport = window.innerWidth >= 1024;

      if (availableGridHeight <= 0 || !isLargeViewport) {
        setHeatmapColumns(widthBasedColumns);
        setHeatmapCellSizePx(null);
        setHeatmapGridHeightPx(null);
        setHeatmapGridWidthPx(null);
        return;
      }

      const balancedLayout = resolveBalancedHeatmapLayout(
        contentWidth,
        availableGridHeight,
        cellGap,
        widthBasedColumns,
        rows
      );

      setHeatmapColumns(balancedLayout.columns);
      setHeatmapCellSizePx(balancedLayout.cellSizePx);
      setHeatmapGridHeightPx(balancedLayout.gridHeightPx);
      setHeatmapGridWidthPx(
        balancedLayout.cellSizePx
          ? balancedLayout.columns * balancedLayout.cellSizePx +
              cellGap * Math.max(0, balancedLayout.columns - 1)
          : null
      );
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
  }, [rows]);

  const failureCount = activityTotals.failed + activityTotals.cancelled;
  const todayCells = buildTodayCells(
    windowCells,
    activityTotals.success,
    failureCount,
    activityTotals.queued,
    activityTotals.running,
    heatmapColumns * rows
  );
  const displayCells = buildColumnMajorDisplayCells(todayCells.cells, rows, heatmapColumns);
  const heatmapGridStyle =
    heatmapCellSizePx && heatmapGridHeightPx
      ? {
          height: `${heatmapGridHeightPx}px`,
          gridTemplateColumns: `repeat(${heatmapColumns}, ${heatmapCellSizePx}px)`,
          gridAutoRows: `${heatmapCellSizePx}px`,
          justifyContent: "center" as const,
          alignContent: "start" as const,
        }
      : {
          gridTemplateColumns: `repeat(${heatmapColumns}, minmax(0, 1fr))`,
        };
  const heatmapHeaderStyle = heatmapGridWidthPx
    ? {
        width: `${heatmapGridWidthPx}px`,
        maxWidth: "100%",
        marginInline: "auto" as const,
      }
    : undefined;

  return (
    <article
      ref={heatmapCardRef}
      className={classNames(
        "surface-card flex w-full min-w-0 flex-col rounded-[1.4rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,246,0.74)]",
        compact ? "px-2.5 pb-2.5 pt-0" : "px-3 pb-3 pt-0",
        className
      )}
    >
      <div
        ref={heatmapHeaderRef}
        className={classNames(
          "flex flex-wrap items-center justify-between",
          compact ? "gap-2 py-2.5" : "gap-3 py-3"
        )}
        style={heatmapHeaderStyle}
      >
        <div
          className={classNames(
            "flex flex-wrap items-center font-semibold tracking-[0.08em] text-[var(--muted)]",
            compact ? "gap-2 text-[0.7rem]" : "gap-3 text-xs"
          )}
        >
          {[
            { tone: "success" as const, label: copy.successLegend, value: taskCounts.success },
            { tone: "failure" as const, label: copy.failureLegend, value: taskCounts.failed },
            { tone: "running" as const, label: copy.runningLegend, value: taskCounts.running },
            { tone: "queued" as const, label: copy.queuedLegend, value: taskCounts.queued },
          ].map((legend) => (
            <span key={legend.label} className="inline-flex items-center gap-2 whitespace-nowrap">
              <span
                className="activity-legend-swatch"
                style={{ backgroundColor: resolveToneColor(legend.tone) }}
              />
              <span className="inline-flex items-center gap-1">
                <span>{legend.label}</span>
                <span>:</span>
                <span>{legend.value}</span>
              </span>
            </span>
          ))}
        </div>
        <div
          className={classNames(
            "font-semibold uppercase tracking-[0.14em] text-[var(--muted)]",
            compact ? "text-[0.7rem]" : "text-xs"
          )}
        >
          {copy.totalLabel.replace("{minutes}", String(activityWindowMinutes))}
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
              key={`window-${activityWindowMinutes}-${rows}-${index}`}
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

      {error ? (
        <div
          className={classNames(
            "rounded-[1rem] border border-[rgba(179,79,59,0.16)] bg-[rgba(179,79,59,0.08)] px-3 py-2 text-xs leading-6 text-[#973d2c]",
            compact ? "mt-2.5" : "mt-3"
          )}
        >
          {error}
        </div>
      ) : null}
    </article>
  );
}
