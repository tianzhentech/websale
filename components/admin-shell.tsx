"use client";

import { ReactNode } from "react";

import { GlobalControls } from "@/components/global-controls";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="glow glow-a" />
        <div className="glow glow-b" />
        <div className="glow glow-c" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-[min(1320px,calc(100vw-1rem))] flex-col gap-4 px-0 py-4 md:w-[min(1320px,calc(100vw-2rem))]">
        <GlobalControls />
        {children}
      </div>
    </main>
  );
}
