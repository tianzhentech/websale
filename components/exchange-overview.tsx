"use client";

import { useExchangeOverviewSnapshot } from "@/components/exchange-overview-shared";
import { useUiPreferences } from "@/components/ui-preferences-provider";

export function ExchangeOverview() {
  const { language } = useUiPreferences();
  const snapshot = useExchangeOverviewSnapshot(language);

  const items = [
    {
      label: snapshot.copy.runningTasks,
      value: snapshot.taskCounts.running,
    },
    {
      label: snapshot.copy.queuedTasks,
      value: snapshot.taskCounts.queued,
    },
    {
      label: snapshot.copy.successTasks,
      value: snapshot.taskCounts.success,
    },
    {
      label: snapshot.copy.failedTasks,
      value: snapshot.taskCounts.failed,
    },
    {
      label: snapshot.copy.rejectedTasks,
      value: snapshot.taskCounts.rejected,
    },
  ];

  return (
    <div className="grid w-full gap-3 p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <article
            key={item.label}
            className="surface-card min-h-[9.5rem] rounded-[1.4rem] border border-[rgba(31,35,28,0.08)] bg-[rgba(255,252,246,0.74)] p-4 shadow-[0_18px_36px_rgba(70,52,24,0.08)]"
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

      {snapshot.error ? (
        <div className="rounded-[1.15rem] border border-[rgba(179,79,59,0.16)] bg-[rgba(179,79,59,0.08)] px-4 py-3 text-sm leading-6 text-[#973d2c]">
          {snapshot.error}
        </div>
      ) : null}
    </div>
  );
}
