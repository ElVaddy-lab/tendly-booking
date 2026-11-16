"use client";

import { useSyncExternalStore } from "react";

import { normalizeTimeZone } from "./manage-booking";

const subscribeNoop = () => () => {};

/**
 * Resolves the visitor's browser IANA timezone after hydration while keeping SSR
 * deterministic on `fallbackTimeZone`.
 */
export function useCustomerTimeZone(fallbackTimeZone: string): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return normalizeTimeZone(resolved, fallbackTimeZone);
      } catch {
        return fallbackTimeZone;
      }
    },
    () => fallbackTimeZone,
  );
}

export function downloadIcsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
