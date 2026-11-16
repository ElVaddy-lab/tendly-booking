"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { formatPriceCents } from "@/lib/booking-slots";
import {
  addDaysToDateKey,
  computeCalendarRangeHours,
  computeDayBlockPlacement,
  formatDateKeyInZone,
  formatZonedLongDate,
  formatZonedShortDate,
  formatZonedTime,
  getIsoWeekdayFromDateKey,
  getWeekDateKeys,
  isSyntheticPlaceholderEmail,
  layoutDayCalendarBlocks,
} from "@/lib/dashboard-bookings";
import type { BookingSummary } from "@/lib/onboarding";
import { localDateTimeToUtcIso, parsePostgresRange } from "@/lib/timezone";
import type { Enums } from "@/types/database.generated";
import {
  createManualBookingAction,
  eraseBookingCustomerDataAction,
  updateBookingStatusAction,
  type DashboardActionState,
} from "./actions";
import styles from "./dashboard.module.css";

type StaffItem = {
  id: string;
  display_name: string;
  is_active: boolean;
};

type ServiceItem = {
  id: string;
  name: string;
  duration_min: number;
  buffer_min: number;
  price_cents: number | null;
  currency: string;
  is_active: boolean;
};

type WeeklyHourItem = {
  id: string;
  staff_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type TimeOffItem = {
  id: string;
  staff_id: string;
  period: unknown;
  reason: string | null;
};

type BookingsWorkbenchProps = {
  businessId: string;
  timezone: string;
  canManage: boolean;
  userStaffId: string | null;
  userStaffName: string | null;
  nowIso: string;
  staff: StaffItem[];
  services: ServiceItem[];
  weeklyHours: WeeklyHourItem[];
  timeOff: TimeOffItem[];
  bookings: BookingSummary[];
};

const HOUR_ROW_PX = 80;
const INITIAL_MANUAL_STATE: DashboardActionState = { error: null };
const emptySubscribe = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => "";

function formatStatusLabel(status: Enums<"booking_status">): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "no_show":
      return "No-show";
    case "cancelled":
      return "Cancelled";
  }
}

export function BookingsWorkbench({
  businessId,
  timezone,
  canManage,
  userStaffId,
  userStaffName,
  nowIso,
  staff,
  services,
  weeklyHours,
  timeOff,
  bookings,
}: BookingsWorkbenchProps) {
  const origin = useSyncExternalStore(
    emptySubscribe,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );
  const manualFormRef = useRef<HTMLFormElement>(null);

  const todayKey = formatDateKeyInZone(nowIso, timezone);
  const [view, setView] = useState<"day" | "week">("day");
  const [activeDateKey, setActiveDateKey] = useState<string>(todayKey);
  const [staffFilterId, setStaffFilterId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Enums<"booking_status">>("all");
  const [listScope, setListScope] = useState<"all" | "window">("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [confirmEraseId, setConfirmEraseId] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [manualState, setManualState] = useState<DashboardActionState>(INITIAL_MANUAL_STATE);
  const [copiedManagePath, setCopiedManagePath] = useState<string | null>(null);
  const [manualDateInput, setManualDateInput] = useState<string>(todayKey);
  const [manualTimeInput, setManualTimeInput] = useState<string>("10:00");

  const [isMutatingRow, startRowTransition] = useTransition();
  const [isCreatingManual, startManualTransition] = useTransition();

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff],
  );
  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const weekKeys = useMemo(() => getWeekDateKeys(activeDateKey), [activeDateKey]);
  const windowDateSet = useMemo(
    () => new Set(view === "day" ? [activeDateKey] : weekKeys),
    [view, activeDateKey, weekKeys],
  );

  const visibleStaff = useMemo(() => {
    if (!canManage) {
      return userStaffId
        ? staff.filter((member) => member.id === userStaffId)
        : [];
    }

    if (staffFilterId !== "all") {
      return staff.filter((member) => member.id === staffFilterId);
    }

    const activeIdsWithBookingsInWindow = new Set(
      bookings
        .filter((b) => windowDateSet.has(formatDateKeyInZone(b.starts_at, timezone)))
        .map((b) => b.staff_id),
    );

    return staff.filter(
      (member) => member.is_active || activeIdsWithBookingsInWindow.has(member.id),
    );
  }, [canManage, userStaffId, staff, staffFilterId, bookings, windowDateSet, timezone]);

  const bookingsInActiveDay = useMemo(
    () =>
      bookings.filter(
        (b) => formatDateKeyInZone(b.starts_at, timezone) === activeDateKey,
      ),
    [bookings, activeDateKey, timezone],
  );

  const { startHour, endHour } = useMemo(
    () =>
      computeCalendarRangeHours({
        bookings: bookingsInActiveDay.map((b) => ({
          startsAt: b.starts_at,
          endsAt: b.ends_at,
        })),
        weeklyHours,
        timeZone: timezone,
      }),
    [bookingsInActiveDay, weeklyHours, timezone],
  );

  const hourMarks = useMemo(
    () =>
      Array.from({ length: endHour - startHour }, (_, idx) => startHour + idx),
    [startHour, endHour],
  );

  const filteredListBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (canManage && staffFilterId !== "all" && b.staff_id !== staffFilterId) {
        return false;
      }
      if (!canManage && userStaffId && b.staff_id !== userStaffId) {
        return false;
      }
      if (statusFilter !== "all" && b.status !== statusFilter) {
        return false;
      }
      if (listScope === "window") {
        const key = formatDateKeyInZone(b.starts_at, timezone);
        if (!windowDateSet.has(key)) {
          return false;
        }
      }
      return true;
    });
  }, [
    bookings,
    canManage,
    staffFilterId,
    userStaffId,
    statusFilter,
    listScope,
    timezone,
    windowDateSet,
  ]);

  const activeServices = useMemo(
    () => services.filter((service) => service.is_active),
    [services],
  );
  const activeStaff = useMemo(
    () => staff.filter((member) => member.is_active),
    [staff],
  );

  const confirmedCount = useMemo(
    () => bookings.filter((b) => b.status === "confirmed").length,
    [bookings],
  );

  function shiftCalendar(direction: -1 | 1) {
    const stepDays = view === "day" ? direction : direction * 7;
    const nextKey = addDaysToDateKey(activeDateKey, stepDays);
    setActiveDateKey(nextKey);
    setManualDateInput(nextKey);
  }

  function handleSelectToday() {
    setActiveDateKey(todayKey);
    setManualDateInput(todayKey);
  }

  function handleSelectDateInput(nextKey: string) {
    if (!nextKey) {
      return;
    }
    setActiveDateKey(nextKey);
    setManualDateInput(nextKey);
  }

  function handleCalendarBookingClick(booking: BookingSummary) {
    setSelectedBookingId(booking.id);
    setListScope("all");
    setStatusFilter("all");
  }

  function handleStatusChange(
    bookingId: string,
    nextStatus: Enums<"booking_status">,
  ) {
    setRowFeedback(null);
    setPendingBookingId(bookingId);

    startRowTransition(async () => {
      const result = await updateBookingStatusAction({
        businessId,
        bookingId,
        status: nextStatus,
      });
      setPendingBookingId(null);
      if (result.error) {
        setRowFeedback({ type: "error", text: result.error });
        return;
      }
      setRowFeedback({
        type: "success",
        text: `Appointment marked ${formatStatusLabel(nextStatus).toLowerCase()}.`,
      });
    });
  }

  function handleEraseCustomer(bookingId: string) {
    setRowFeedback(null);
    setPendingBookingId(bookingId);

    startRowTransition(async () => {
      const result = await eraseBookingCustomerDataAction({
        businessId,
        bookingId,
      });
      setPendingBookingId(null);
      setConfirmEraseId(null);
      if (result.error) {
        setRowFeedback({ type: "error", text: result.error });
        return;
      }
      setRowFeedback({
        type: "success",
        text: "Client details permanently erased.",
      });
    });
  }

  function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setCopiedManagePath(null);

    startManualTransition(async () => {
      const result = await createManualBookingAction(INITIAL_MANUAL_STATE, formData);
      setManualState(result);
      if (!result.error) {
        if (result.createdDateKey) {
          setActiveDateKey(result.createdDateKey);
        }
        manualFormRef.current?.reset();
      }
    });
  }

  async function handleCopyManageLink(managePath: string) {
    const fullUrl = `${origin}${managePath}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedManagePath(managePath);
    } catch {
      setCopiedManagePath(null);
    }
  }

  function resolveDayTimeOffBlocks(staffId: string, dateKey: string) {
    const dayStartIso = localDateTimeToUtcIso(`${dateKey}T00:00`, timezone);
    const nextKey = addDaysToDateKey(dateKey, 1);
    const dayEndIso = localDateTimeToUtcIso(`${nextKey}T00:00`, timezone);
    if (!dayStartIso || !dayEndIso) {
      return [];
    }
    const dayStartMs = Date.parse(dayStartIso);
    const dayEndMs = Date.parse(dayEndIso);

    return timeOff
      .filter((entry) => entry.staff_id === staffId)
      .flatMap((entry) => {
        const parsed = parsePostgresRange(entry.period);
        if (!parsed) {
          return [];
        }
        const sMs = parsed.start.getTime();
        const eMs = parsed.end.getTime();
        if (eMs <= dayStartMs || sMs >= dayEndMs) {
          return [];
        }
        const clampedStart = new Date(Math.max(sMs, dayStartMs)).toISOString();
        const clampedEnd = new Date(Math.min(eMs, dayEndMs)).toISOString();
        const placement = computeDayBlockPlacement({
          startsAtIso: clampedStart,
          endsAtIso: clampedEnd,
          startHour,
          endHour,
          timeZone: timezone,
        });
        return [
          {
            id: entry.id,
            reason: entry.reason || "Time off",
            topPercent: placement.topPercent,
            heightPercent: placement.heightPercent,
          },
        ];
      });
  }

  const periodHeading =
    view === "day"
      ? formatZonedLongDate(activeDateKey)
      : `${formatZonedShortDate(weekKeys[0])} – ${formatZonedShortDate(weekKeys[6])}`;

  const activeDayIsoWeekday = getIsoWeekdayFromDateKey(activeDateKey);
  const gridHeightPx = hourMarks.length * HOUR_ROW_PX;

  const canCreateManualBooking =
    activeServices.length > 0 &&
    (canManage ? activeStaff.length > 0 : Boolean(userStaffId));

  const manualManagePath = manualState.managePath ?? null;
  const fullManualManageUrl = manualManagePath ? `${origin}${manualManagePath}` : null;

  return (
    <section
      id="bookings"
      className={styles.sectionBlock}
      aria-labelledby="bookings-heading"
    >
      <div className={styles.sectionHeadingRow}>
        <h2 id="bookings-heading" className={styles.sectionTitle}>
          Calendar &amp; bookings
        </h2>
        <span className={styles.panelMeta}>
          {confirmedCount} confirmed · {bookings.length} total
          {!canManage && userStaffName ? ` · Your schedule (${userStaffName})` : ""}
        </span>
      </div>

      {/* Calendar Controls + Day/Week Grid */}
      <div className={styles.restPanel}>
        <div className={styles.calendarToolbar}>
          <div className={styles.viewToggle} role="group" aria-label="Calendar view">
            <button
              type="button"
              className={styles.viewButton}
              aria-pressed={view === "day"}
              onClick={() => setView("day")}
            >
              Day
            </button>
            <button
              type="button"
              className={styles.viewButton}
              aria-pressed={view === "week"}
              onClick={() => setView("week")}
            >
              Week
            </button>
          </div>

          <div className={styles.dateNavCluster}>
            <button
              type="button"
              className={styles.pagerButton}
              onClick={() => shiftCalendar(-1)}
              aria-label={view === "day" ? "Previous day" : "Previous week"}
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleSelectToday}
            >
              Today
            </button>
            <button
              type="button"
              className={styles.pagerButton}
              onClick={() => shiftCalendar(1)}
              aria-label={view === "day" ? "Next day" : "Next week"}
            >
              ›
            </button>
            <input
              type="date"
              aria-label="Calendar date"
              value={activeDateKey}
              onChange={(event) => handleSelectDateInput(event.target.value)}
              className={styles.dateJumpInput}
            />
            <span className={styles.calendarRangeTitle}>{periodHeading}</span>
          </div>

          {canManage && staff.length > 1 ? (
            <div className={styles.filterControl}>
              <label htmlFor="calendar-staff-filter" className={styles.srOnly}>
                Filter specialist
              </label>
              <select
                id="calendar-staff-filter"
                aria-label="Filter specialist"
                value={staffFilterId}
                onChange={(event) => setStaffFilterId(event.target.value)}
                className={styles.selectCompact}
              >
                <option value="all">All specialists</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                    {!member.is_active ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {visibleStaff.length === 0 ? (
          <p className={styles.emptyNote}>
            {!canManage
              ? "Link your account to a staff profile to view and manage your calendar."
              : "Add an active staff member to view the schedule grid."}
          </p>
        ) : view === "day" ? (
          <div
            className={styles.dayGridScroller}
            role="region"
            aria-label="Day schedule grid"
            tabIndex={0}
          >
            <div
              className={styles.dayGridFrame}
              style={{
                gridTemplateColumns: `4.25rem repeat(${visibleStaff.length}, minmax(11.5rem, 1fr))`,
              }}
            >
              <div className={styles.dayCornerCell}>
                <span className={styles.axisZone}>{timezone.split("/").pop()}</span>
              </div>
              {visibleStaff.map((member) => {
                const shifts = weeklyHours.filter(
                  (h) => h.staff_id === member.id && h.weekday === activeDayIsoWeekday,
                );
                return (
                  <div key={member.id} className={styles.dayStaffHead}>
                    <span className={styles.dayStaffName}>{member.display_name}</span>
                    <span className={styles.dayStaffHours}>
                      {shifts.length > 0
                        ? shifts
                            .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
                            .join(", ")
                        : "Off schedule"}
                    </span>
                  </div>
                );
              })}

              <div
                className={styles.timeAxisColumn}
                style={{ height: `${gridHeightPx}px` }}
              >
                {hourMarks.map((hour) => (
                  <div
                    key={hour}
                    className={styles.timeAxisCell}
                    style={{ height: `${HOUR_ROW_PX}px` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {visibleStaff.map((member) => {
                const memberBookings = bookingsInActiveDay.filter(
                  (b) => b.staff_id === member.id,
                );
                const lanes = layoutDayCalendarBlocks(
                  memberBookings.map((b) => ({
                    id: b.id,
                    startsAt: b.starts_at,
                    endsAt: b.ends_at,
                  })),
                );
                const laneMap = new Map(lanes.map((l) => [l.id, l]));
                const timeOffBlocks = resolveDayTimeOffBlocks(member.id, activeDateKey);

                const shifts = weeklyHours.filter(
                  (h) => h.staff_id === member.id && h.weekday === activeDayIsoWeekday,
                );

                return (
                  <div
                    key={member.id}
                    className={styles.dayStaffColumn}
                    style={{ height: `${gridHeightPx}px` }}
                  >
                    {hourMarks.map((hour) => (
                      <div
                        key={hour}
                        className={styles.hourGridLine}
                        style={{ height: `${HOUR_ROW_PX}px` }}
                      />
                    ))}

                    {shifts.map((shift) => {
                      const shiftStartH = Number(shift.start_time.slice(0, 2));
                      const shiftStartM = Number(shift.start_time.slice(3, 5));
                      const shiftEndH = Number(shift.end_time.slice(0, 2));
                      const shiftEndM = Number(shift.end_time.slice(3, 5));
                      const totalMin = (endHour - startHour) * 60;
                      const topMin = Math.max(
                        0,
                        shiftStartH * 60 + shiftStartM - startHour * 60,
                      );
                      const botMin = Math.min(
                        totalMin,
                        shiftEndH * 60 + shiftEndM - startHour * 60,
                      );
                      if (botMin <= topMin) {
                        return null;
                      }
                      return (
                        <div
                          key={shift.id}
                          className={styles.shiftBand}
                          style={{
                            top: `${(topMin / totalMin) * 100}%`,
                            height: `${((botMin - topMin) / totalMin) * 100}%`,
                          }}
                          aria-hidden="true"
                        />
                      );
                    })}

                    {timeOffBlocks.map((block) => (
                      <div
                        key={block.id}
                        className={styles.timeOffBlock}
                        style={{
                          top: `${block.topPercent}%`,
                          height: `${block.heightPercent}%`,
                        }}
                      >
                        <span className={styles.timeOffLabel}>{block.reason}</span>
                      </div>
                    ))}

                    {memberBookings.map((booking) => {
                      const svc = serviceById.get(booking.service_id);
                      const pos = computeDayBlockPlacement({
                        startsAtIso: booking.starts_at,
                        endsAtIso: booking.ends_at,
                        startHour,
                        endHour,
                        timeZone: timezone,
                      });
                      const laneInfo = laneMap.get(booking.id) ?? {
                        lane: 0,
                        laneCount: 1,
                      };
                      const widthPct = 100 / laneInfo.laneCount;
                      const leftPct = laneInfo.lane * widthPct;
                      const startLabel = formatZonedTime(booking.starts_at, timezone);
                      const endLabel = formatZonedTime(booking.ends_at, timezone);
                      const durationMin = Math.round(
                        (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000,
                      );
                      const isCompactBlock = durationMin <= 25;

                      return (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => handleCalendarBookingClick(booking)}
                          className={styles.bookingBlock}
                          data-status={booking.status}
                          data-compact={isCompactBlock ? "true" : "false"}
                          data-selected={selectedBookingId === booking.id ? "true" : "false"}
                          style={{
                            top: `${pos.topPercent}%`,
                            height: `${pos.heightPercent}%`,
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                          }}
                        >
                          <span className={styles.bookingBlockTime}>
                            {isCompactBlock ? startLabel : `${startLabel}–${endLabel}`}
                          </span>
                          <span className={styles.bookingBlockTitle}>
                            {booking.customer_name} · {svc?.name ?? "Service"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className={styles.weekGridScroller}
            role="region"
            aria-label="Week schedule grid"
            tabIndex={0}
          >
            <div className={styles.weekGridTable}>
              <div className={styles.weekHeaderCell}>Specialist</div>
              {weekKeys.map((dayKey) => (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => {
                    setActiveDateKey(dayKey);
                    setManualDateInput(dayKey);
                    setView("day");
                  }}
                  className={styles.weekDayHeadButton}
                  data-active={dayKey === activeDateKey ? "true" : "false"}
                >
                  {formatZonedShortDate(dayKey)}
                </button>
              ))}

              {visibleStaff.map((member) => (
                <div key={member.id} className={styles.weekRowGroup}>
                  <div className={styles.weekStaffCell}>
                    <span className={styles.dayStaffName}>{member.display_name}</span>
                  </div>
                  {weekKeys.map((dayKey) => {
                    const dayBookings = bookings.filter(
                      (b) =>
                        b.staff_id === member.id &&
                        formatDateKeyInZone(b.starts_at, timezone) === dayKey,
                    );
                    const offBlocks = resolveDayTimeOffBlocks(member.id, dayKey);
                    return (
                      <div
                        key={dayKey}
                        className={styles.weekDayCell}
                        data-day-label={formatZonedShortDate(dayKey)}
                      >
                        {offBlocks.map((off) => (
                          <span key={off.id} className={styles.weekTimeOffTag}>
                            {off.reason}
                          </span>
                        ))}
                        {dayBookings.length === 0 && offBlocks.length === 0 ? (
                          <span className={styles.weekEmptyDash}>—</span>
                        ) : (
                          dayBookings.map((booking) => {
                            const svc = serviceById.get(booking.service_id);
                            return (
                              <button
                                key={booking.id}
                                type="button"
                                onClick={() => handleCalendarBookingClick(booking)}
                                className={styles.weekChip}
                                data-status={booking.status}
                                data-selected={
                                  selectedBookingId === booking.id ? "true" : "false"
                                }
                              >
                                <span className={styles.weekChipTime}>
                                  {formatZonedTime(booking.starts_at, timezone)}
                                </span>
                                <span className={styles.weekChipCopy}>
                                  {booking.customer_name} · {svc?.name ?? "Service"}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Appointments List + Manual Booking Form */}
      <div className={styles.bookingsColumns}>
        <section
          className={styles.restPanel}
          aria-labelledby="appointments-list-heading"
        >
          <div className={styles.listPanelHeader}>
            <h3 id="appointments-list-heading" className={styles.subsectionTitle}>
              Appointments list
            </h3>
          </div>
          <div className={styles.listToolbar}>
            <div className={styles.statusFilterGroup} role="group" aria-label="Filter by status">
              {(
                [
                  ["all", "All"],
                  ["confirmed", "Confirmed"],
                  ["completed", "Completed"],
                  ["no_show", "No-show"],
                  ["cancelled", "Cancelled"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={styles.filterPill}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.scopeToggle} role="group" aria-label="Date scope">
              <button
                type="button"
                className={styles.filterPill}
                aria-pressed={listScope === "all"}
                onClick={() => setListScope("all")}
              >
                All dates
              </button>
              <button
                type="button"
                className={styles.filterPill}
                aria-pressed={listScope === "window"}
                onClick={() => setListScope("window")}
              >
                Selected {view === "day" ? "day" : "week"}
              </button>
            </div>
          </div>

          {rowFeedback ? (
            <div className={styles.listBannerWrap}>
              <p
                className={
                  rowFeedback.type === "error" ? styles.alertError : styles.alertSuccess
                }
                role={rowFeedback.type === "error" ? "alert" : "status"}
              >
                {rowFeedback.text}
              </p>
            </div>
          ) : null}

          {filteredListBookings.length > 0 ? (
            <ul className={styles.list}>
              {filteredListBookings.map((booking) => {
                const svc = serviceById.get(booking.service_id);
                const member = staffById.get(booking.staff_id);
                const dateKey = formatDateKeyInZone(booking.starts_at, timezone);
                const shortDate = formatZonedShortDate(dateKey);
                const startClock = formatZonedTime(booking.starts_at, timezone);
                const endClock = formatZonedTime(booking.ends_at, timezone);
                const priceLabel = svc
                  ? formatPriceCents(svc.price_cents, svc.currency)
                  : null;
                const isErased = Boolean(booking.erased_at);
                const isSyntheticWalkin = isSyntheticPlaceholderEmail(
                  booking.customer_email,
                );
                const isRowBusy = isMutatingRow && pendingBookingId === booking.id;
                const bookingDescriptor = `${booking.customer_name} on ${shortDate} at ${startClock}`;

                return (
                  <li
                    key={booking.id}
                    className={styles.bookingRow}
                    data-selected={selectedBookingId === booking.id ? "true" : "false"}
                  >
                    <div className={styles.bookingRowMain}>
                      <div className={styles.bookingRowTop}>
                        <span className={styles.bookingWhen}>
                          {shortDate} · {startClock}–{endClock}
                        </span>
                        <span
                          className={styles.bookingStatusChip}
                          data-status={booking.status}
                        >
                          {formatStatusLabel(booking.status)}
                        </span>
                        {isErased ? (
                          <span className={styles.erasedPill}>Data erased</span>
                        ) : null}
                      </div>

                      <div className={styles.bookingTitleLine}>
                        <span className={styles.itemName}>{booking.customer_name}</span>
                        <span className={styles.itemSubmeta}>
                          {svc?.name ?? "Service"}
                          {priceLabel ? ` (${priceLabel})` : ""} with{" "}
                          {member?.display_name ?? "Staff"}
                        </span>
                      </div>

                      {!isErased ? (
                        <div className={styles.bookingClientMeta}>
                          <span>
                            {isSyntheticWalkin
                              ? "Walk-in (no email)"
                              : booking.customer_email}
                          </span>
                          {booking.customer_phone ? (
                            <span> · {booking.customer_phone}</span>
                          ) : null}
                          {booking.notes ? (
                            <p className={styles.bookingNotes}>Note: {booking.notes}</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className={styles.bookingErasedNote}>
                          Customer contact details scrubbed upon request.
                        </p>
                      )}
                    </div>

                    <div className={styles.bookingRowActions}>
                      {booking.status === "confirmed" ? (
                        <div className={styles.statusActionButtons}>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            aria-label={`Complete booking for ${bookingDescriptor}`}
                            className={styles.secondaryButton}
                            onClick={() => handleStatusChange(booking.id, "completed")}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            aria-label={`No-show booking for ${bookingDescriptor}`}
                            className={styles.secondaryButton}
                            onClick={() => handleStatusChange(booking.id, "no_show")}
                          >
                            No-show
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            aria-label={`Cancel ${bookingDescriptor}`}
                            className={styles.dangerButton}
                            onClick={() => handleStatusChange(booking.id, "cancelled")}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}

                      {canManage && !isErased ? (
                        confirmEraseId === booking.id ? (
                          <div className={styles.eraseConfirmBox}>
                            <span className={styles.eraseConfirmPrompt}>
                              Erase client details permanently?
                            </span>
                            <div className={styles.eraseConfirmActions}>
                              <button
                                type="button"
                                disabled={isRowBusy}
                                className={styles.secondaryButton}
                                onClick={() => setConfirmEraseId(null)}
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                disabled={isRowBusy}
                                aria-label={`Confirm erase client data for ${bookingDescriptor}`}
                                className={styles.dangerSolidButton}
                                onClick={() => handleEraseCustomer(booking.id)}
                              >
                                Confirm erase
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isRowBusy}
                            aria-label={`Erase client data for ${bookingDescriptor}`}
                            className={styles.eraseTriggerButton}
                            onClick={() => {
                              setConfirmEraseId(booking.id);
                              setRowFeedback(null);
                            }}
                          >
                            Erase client data
                          </button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.emptyNote}>
              No appointments match the current filter.
            </p>
          )}
        </section>

        {/* Manual Booking Form */}
        <section
          className={styles.activeEditorCard}
          aria-labelledby="manual-booking-heading"
        >
          <h3 id="manual-booking-heading" className={styles.subsectionTitle}>
            Create manual booking
          </h3>

          {!canCreateManualBooking ? (
            <p className={styles.metricLabel}>
              {!canManage && !userStaffId
                ? "Link your account to an active staff profile to log appointments."
                : "Ensure at least one active service and specialist are configured first."}
            </p>
          ) : (
            <form
              ref={manualFormRef}
              onSubmit={handleManualSubmit}
              className={styles.formStack}
              noValidate
            >
              <input type="hidden" name="businessId" value={businessId} />

              {canManage ? (
                <div className={styles.fieldGroup}>
                  <label htmlFor="manual-staff" className={styles.label}>
                    Specialist
                  </label>
                  <select
                    id="manual-staff"
                    name="staffId"
                    required
                    defaultValue={
                      staffFilterId !== "all"
                        ? staffFilterId
                        : (activeStaff[0]?.id ?? "")
                    }
                    className={styles.select}
                  >
                    {activeStaff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <input type="hidden" name="staffId" value={userStaffId ?? ""} />
                  <p className={styles.itemSubmeta}>
                    Booking onto your own schedule ({userStaffName}).
                  </p>
                </>
              )}

              <div className={styles.fieldGroup}>
                <label htmlFor="manual-service" className={styles.label}>
                  Service
                </label>
                <select
                  id="manual-service"
                  name="serviceId"
                  required
                  className={styles.select}
                >
                  {activeServices.map((service) => {
                    const price = formatPriceCents(
                      service.price_cents,
                      service.currency,
                    );
                    return (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.duration_min} min
                        {price ? ` · ${price}` : ""})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="manual-date" className={styles.label}>
                    Date ({timezone})
                  </label>
                  <input
                    id="manual-date"
                    name="dateLocal"
                    type="date"
                    required
                    value={manualDateInput}
                    onChange={(event) => setManualDateInput(event.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="manual-time" className={styles.label}>
                    Start time ({timezone})
                  </label>
                  <input
                    id="manual-time"
                    name="timeLocal"
                    type="time"
                    required
                    value={manualTimeInput}
                    onChange={(event) => setManualTimeInput(event.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="manual-customer-name" className={styles.label}>
                  Client name
                </label>
                <input
                  id="manual-customer-name"
                  name="customerName"
                  type="text"
                  required
                  maxLength={80}
                  placeholder="Walk-in or phone client"
                  className={styles.input}
                />
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="manual-customer-email" className={styles.label}>
                    Client email (optional)
                  </label>
                  <input
                    id="manual-customer-email"
                    name="customerEmail"
                    type="email"
                    maxLength={254}
                    placeholder="name@example.com"
                    className={styles.input}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="manual-customer-phone" className={styles.label}>
                    Phone (optional)
                  </label>
                  <input
                    id="manual-customer-phone"
                    name="customerPhone"
                    type="tel"
                    maxLength={32}
                    placeholder="+48 500 100 200"
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="manual-notes" className={styles.label}>
                  Notes (optional)
                </label>
                <input
                  id="manual-notes"
                  name="notes"
                  type="text"
                  maxLength={1000}
                  placeholder="Requested style or front-desk note"
                  className={styles.input}
                />
              </div>

              {manualState.error ? (
                <p className={styles.alertError} role="alert">
                  {manualState.error}
                </p>
              ) : manualState.success ? (
                <p className={styles.alertSuccess} role="status">
                  {manualState.success}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isCreatingManual}
                className={styles.workbenchSubmitButton}
              >
                {isCreatingManual ? "Saving booking..." : "Create manual booking"}
              </button>

              {manualManagePath && fullManualManageUrl ? (
                <div className={styles.inviteBox}>
                  <label htmlFor="manual-manage-link" className={styles.label}>
                    Client self-manage link
                  </label>
                  <div className={styles.inviteRow}>
                    <input
                      id="manual-manage-link"
                      type="text"
                      readOnly
                      value={fullManualManageUrl}
                      className={styles.inviteInput}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyManageLink(manualManagePath)}
                      className={styles.secondaryButton}
                    >
                      {copiedManagePath === manualManagePath
                        ? "Copied link"
                        : "Copy link"}
                    </button>
                    <Link
                      href={manualManagePath}
                      prefetch={false}
                      className={styles.secondaryLink}
                    >
                      Open link
                    </Link>
                  </div>
                </div>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
