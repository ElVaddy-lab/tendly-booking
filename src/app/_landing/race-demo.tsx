"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./landing.module.css";

type Phase = "done" | "pending" | "first";

/**
 * Two tabs book the same slot. The final state renders first (and stays put
 * without JS or with reduced motion); on scroll into view the race replays once.
 */
export function RaceDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("done");

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: number[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPhase("pending");
        timers.push(window.setTimeout(() => setPhase("first"), 900));
        timers.push(window.setTimeout(() => setPhase("done"), 1500));
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const first = phase === "pending" ? "Booking…" : "Booked";
  const second = phase === "done" ? "Slot just taken" : "Booking…";

  return (
    <div ref={ref} className={styles.race} aria-hidden="true" data-phase={phase}>
      <div className={styles.raceTabsHeader}>
        <span className={styles.raceTabPillActive}>Tab 1</span>
        <span className={styles.raceTabPill}>Tab 2</span>
      </div>
      <div className={styles.raceRows}>
        <div className={styles.raceRow}>
          <span className={styles.raceSlot}>Tue 10:30</span>
          <span className={phase === "pending" ? styles.raceWait : styles.raceOk}>{first}</span>
        </div>
        <div className={styles.raceRow}>
          <span className={styles.raceSlot}>Tue 10:30</span>
          <span className={phase === "done" ? styles.raceNo : styles.raceWait}>{second}</span>
        </div>
      </div>
    </div>
  );
}
