"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { TurnstileField } from "@/components/turnstile-field";
import { downloadIcsFile, useCustomerTimeZone } from "@/lib/booking-client";
import {
  buildBookingDateDays,
  groupAvailableSlotsByDate,
  type GroupedBookingSlot,
  type RawAvailableSlot,
} from "@/lib/booking-slots";
import {
  formatBookingDateTime,
  formatDeadlineLabel,
  getDisplayInitials,
  isSameBookingSlot,
} from "@/lib/manage-booking";
import {
  cancelBookingAction,
  listRescheduleSlotsAction,
  rescheduleBookingAction,
} from "./actions";
import type { ManageBookingDetails } from "./data";
import styles from "./manage.module.css";

type ManageFlowProps = {
  token: string;
  initialBooking: ManageBookingDetails;
  initialSlots: RawAvailableSlot[];
  initialSlotsError: string | null;
  initialGeneratedAtIso: string;
};

const DAYS_PER_PAGE = 7;
const FETCH_WINDOW_DAYS = 14;

function statusLabel(status: ManageBookingDetails["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "no_show":
      return "No-show";
  }
}

function isCurrentBookingSlot(params: {
  slot: GroupedBookingSlot;
  selectedStaffId: string | null;
  bookingStaffId: string;
  bookingStartsAtIso: string;
}): boolean {
  if (
    isSameBookingSlot({
      selectedStaffId: params.selectedStaffId,
      selectedStartsAtIso: params.slot.startsAtIso,
      currentStaffId: params.bookingStaffId,
      currentStartsAtIso: params.bookingStartsAtIso,
    })
  ) {
    return true;
  }

  if (params.selectedStaffId === null) {
    const slotMs = Date.parse(params.slot.startsAtIso);
    const currentMs = Date.parse(params.bookingStartsAtIso);
    return (
      slotMs === currentMs &&
      params.slot.staffIds.length === 1 &&
      params.slot.staffIds[0] === params.bookingStaffId
    );
  }

  return false;
}

export function ManageFlow({
  token,
  initialBooking,
  initialSlots,
  initialSlotsError,
  initialGeneratedAtIso,
}: ManageFlowProps) {
  const [booking, setBooking] = useState<ManageBookingDetails>(initialBooking);
  const shopTimeZone = booking.businessTimezone;
  const fallbackZone = booking.customerTimezone || shopTimeZone;
  const customerTimeZone = useCustomerTimeZone(fallbackZone);

  const initialDefaultStaff = booking.eligibleStaff.some(
    (member) => member.id === booking.staffId,
  )
    ? booking.staffId
    : null;

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(
    initialDefaultStaff,
  );
  const [rawSlots, setRawSlots] = useState<RawAvailableSlot[]>(initialSlots);
  const [slotsError, setSlotsError] = useState<string | null>(initialSlotsError);
  const [dayPageOffset, setDayPageOffset] = useState<number>(0);
  const [loadedFromOffset, setLoadedFromOffset] = useState<number>(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);

  const [isConfirmingCancel, setIsConfirmingCancel] = useState<boolean>(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isLoadingSlots, startSlotsTransition] = useTransition();
  const [isCancelling, startCancelTransition] = useTransition();
  const [isRescheduling, startRescheduleTransition] = useTransition();

  const filteredSlots = useMemo(() => {
    if (!selectedStaffId) {
      return rawSlots;
    }
    return rawSlots.filter((slot) => slot.staff_id === selectedStaffId);
  }, [rawSlots, selectedStaffId]);

  const groupedSlots = useMemo(
    () => groupAvailableSlotsByDate(filteredSlots, customerTimeZone, shopTimeZone),
    [filteredSlots, customerTimeZone, shopTimeZone],
  );

  const anchorInstant = useMemo(
    () => new Date(initialGeneratedAtIso),
    [initialGeneratedAtIso],
  );
  const totalHorizonDays = Math.max(1, booking.bookingHorizonDays);

  const allHorizonDays = useMemo(
    () =>
      buildBookingDateDays(
        anchorInstant,
        Math.min(
          totalHorizonDays,
          Math.max(loadedFromOffset + FETCH_WINDOW_DAYS, dayPageOffset + DAYS_PER_PAGE),
        ),
        customerTimeZone,
      ),
    [anchorInstant, totalHorizonDays, loadedFromOffset, dayPageOffset, customerTimeZone],
  );

  const visibleDays = useMemo(
    () => allHorizonDays.slice(dayPageOffset, dayPageOffset + DAYS_PER_PAGE),
    [allHorizonDays, dayPageOffset],
  );

  const bookingStartClock = formatBookingDateTime(
    booking.startsAt,
    customerTimeZone,
  );
  const bookingShopClock = formatBookingDateTime(booking.startsAt, shopTimeZone);
  const deadlineLabel = formatDeadlineLabel(booking.deadlineAt, customerTimeZone);

  const currentDateKey = useMemo(() => {
    const startMs = Date.parse(booking.startsAt);
    if (Number.isNaN(startMs)) {
      return null;
    }
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: customerTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startMs));
  }, [booking.startsAt, customerTimeZone]);

  const effectiveDateKey = useMemo(() => {
    if (
      selectedDateKey &&
      visibleDays.some((day) => day.dateKey === selectedDateKey)
    ) {
      return selectedDateKey;
    }

    if (
      currentDateKey &&
      visibleDays.some((day) => day.dateKey === currentDateKey) &&
      (groupedSlots[currentDateKey]?.length ?? 0) > 0
    ) {
      return currentDateKey;
    }

    const firstWithSlots = visibleDays.find(
      (day) => (groupedSlots[day.dateKey]?.length ?? 0) > 0,
    );
    if (firstWithSlots) {
      return firstWithSlots.dateKey;
    }

    return visibleDays[0]?.dateKey ?? null;
  }, [selectedDateKey, visibleDays, currentDateKey, groupedSlots]);

  const slotsForSelectedDate = useMemo<GroupedBookingSlot[]>(
    () => (effectiveDateKey ? groupedSlots[effectiveDateKey] ?? [] : []),
    [effectiveDateKey, groupedSlots],
  );

  const effectiveSlot = useMemo<GroupedBookingSlot | null>(() => {
    if (slotsForSelectedDate.length === 0) {
      return null;
    }
    if (selectedSlotIso) {
      const match = slotsForSelectedDate.find(
        (slot) => slot.startsAtIso === selectedSlotIso,
      );
      if (match) {
        return match;
      }
    }
    return (
      slotsForSelectedDate.find(
        (slot) =>
          !isCurrentBookingSlot({
            slot,
            selectedStaffId,
            bookingStaffId: booking.staffId,
            bookingStartsAtIso: booking.startsAt,
          }),
      ) ??
      slotsForSelectedDate[0] ??
      null
    );
  }, [
    slotsForSelectedDate,
    selectedSlotIso,
    selectedStaffId,
    booking.staffId,
    booking.startsAt,
  ]);

  const activeDayOption = useMemo(
    () =>
      visibleDays.find((day) => day.dateKey === effectiveDateKey) ??
      visibleDays[0] ??
      null,
    [visibleDays, effectiveDateKey],
  );

  function refreshSlotsFor(windowStartDayOffset: number) {
    const windowFrom = new Date(
      anchorInstant.getTime() + windowStartDayOffset * 24 * 60 * 60 * 1000,
    );
    startSlotsTransition(async () => {
      const response = await listRescheduleSlotsAction({
        token,
        staffId: null,
        fromIso: windowStartDayOffset === 0 ? undefined : windowFrom.toISOString(),
      });
      setRawSlots(response.slots);
      setSlotsError(response.error);
      setLoadedFromOffset(windowStartDayOffset);
    });
  }

  function handlePageDays(delta: number) {
    const nextOffset = Math.max(
      0,
      Math.min(
        Math.max(0, totalHorizonDays - DAYS_PER_PAGE),
        dayPageOffset + delta,
      ),
    );
    setDayPageOffset(nextOffset);
    setSelectedDateKey(null);
    setSelectedSlotIso(null);

    const needsFetch =
      nextOffset < loadedFromOffset ||
      nextOffset + DAYS_PER_PAGE > loadedFromOffset + FETCH_WINDOW_DAYS;
    if (needsFetch) {
      refreshSlotsFor(nextOffset);
    }
  }

  function handleConfirmCancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

    setMutationError(null);
    setStatusMessage(null);

    startCancelTransition(async () => {
      const result = await cancelBookingAction({
        token,
        turnstileToken,
      });

      if (result.booking) {
        setBooking(result.booking);
      }

      if (result.error) {
        setMutationError(result.error);
        return;
      }

      setIsConfirmingCancel(false);
      setStatusMessage("Your appointment has been cancelled and the time slot released.");
    });
  }

  function handleReschedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !effectiveSlot ||
      isCurrentBookingSlot({
        slot: effectiveSlot,
        selectedStaffId,
        bookingStaffId: booking.staffId,
        bookingStartsAtIso: booking.startsAt,
      })
    ) {
      setMutationError("Select a different time or specialist to reschedule.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

    setMutationError(null);
    setStatusMessage(null);

    startRescheduleTransition(async () => {
      const result = await rescheduleBookingAction({
        token,
        staffId: selectedStaffId,
        startsAt: effectiveSlot.startsAtIso,
        turnstileToken,
      });

      if (result.booking) {
        setBooking(result.booking);
      }

      if (result.error) {
        setMutationError(result.error);
        if (result.code === "slot_unavailable") {
          setSelectedSlotIso(null);
          refreshSlotsFor(loadedFromOffset);
        }
        return;
      }

      const updatedClock = result.booking
        ? formatBookingDateTime(result.booking.startsAt, customerTimeZone)
        : null;
      setSelectedSlotIso(null);
      setStatusMessage(
        updatedClock
          ? `Appointment rescheduled to ${updatedClock.dateLabel} at ${updatedClock.timeLabel}.`
          : "Appointment rescheduled.",
      );
      if (result.booking?.canReschedule) {
        refreshSlotsFor(loadedFromOffset);
      }
    });
  }

  const showRescheduleBoard = booking.status === "confirmed" && booking.canReschedule;
  const isBusy = isCancelling || isRescheduling || isLoadingSlots;
  const effectiveIsSameSlot = effectiveSlot
    ? isCurrentBookingSlot({
        slot: effectiveSlot,
        selectedStaffId,
        bookingStaffId: booking.staffId,
        bookingStartsAtIso: booking.startsAt,
      })
    : false;

  const confirmNewTimeLabel =
    effectiveSlot && !effectiveIsSameSlot
      ? `Confirm new time · ${effectiveSlot.shortDateLabel} ${effectiveSlot.displayTime}`
      : "Select a new time";

  const showSeparateShopClock =
    bookingShopClock.timeLabel !== bookingStartClock.timeLabel ||
    bookingShopClock.dateLabel !== bookingStartClock.dateLabel;

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.brandCluster}>
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <Link href={`/b/${booking.businessSlug}`} className={styles.shopCrumb}>
            /b/{booking.businessSlug}
          </Link>
        </div>

        <div className={styles.businessHeader}>
          <h1 className={styles.businessName}>{booking.businessName}</h1>
          {booking.businessIsDemo ? (
            <span className={styles.demoTag}>Demo business · fictional</span>
          ) : null}
        </div>

        <div className={styles.timezoneWrap}>
          <span className={styles.timezonePill}>
            Shop time: {shopTimeZone} · Shown in your time: {customerTimeZone}
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={showRescheduleBoard ? styles.manageGrid : styles.singleGrid}>
          {/* Left (or standalone): Perforated Paper Ticket */}
          <div className={styles.ticketShadowWrap}>
            <section
              className={styles.ticketCard}
              aria-label="Booking details"
            >
              <div className={styles.ticketTopRow}>
                <span className={styles.statusBadge} data-status={booking.status}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {statusLabel(booking.status)}
                </span>
                <span className={styles.ticketRef}>
                  Booking #{booking.bookingId.slice(0, 8)}
                </span>
              </div>

              <h2 className={styles.ticketHeadline}>
                {booking.serviceName} · {bookingStartClock.dateLabel} at{" "}
                {bookingStartClock.timeLabel}
              </h2>

              {showSeparateShopClock ? (
                <p className={styles.ticketShopClock}>
                  Shop time: {bookingShopClock.dateLabel} at {bookingShopClock.timeLabel}{" "}
                  ({shopTimeZone})
                </p>
              ) : null}

              <dl className={styles.metaList}>
                <div className={styles.metaRow}>
                  <dt className={styles.metaTerm}>Specialist</dt>
                  <dd className={styles.metaValue}>{booking.staffName}</dd>
                </div>
                <div className={styles.metaRow}>
                  <dt className={styles.metaTerm}>Duration</dt>
                  <dd className={styles.metaValue}>
                    {booking.serviceDurationMin} min
                    {booking.priceLabel ? ` · ${booking.priceLabel}` : ""}
                  </dd>
                </div>
                <div className={styles.metaRow}>
                  <dt className={styles.metaTerm}>Client</dt>
                  <dd className={styles.metaValue}>{booking.customerName}</dd>
                </div>
                {booking.notes ? (
                  <div className={styles.metaRow}>
                    <dt className={styles.metaTerm}>Notes</dt>
                    <dd className={styles.metaValue}>{booking.notes}</dd>
                  </div>
                ) : null}
              </dl>

              {statusMessage ? (
                <p className={styles.statusMessage} role="status" aria-live="polite">
                  {statusMessage}
                </p>
              ) : null}

              {mutationError && !showRescheduleBoard ? (
                <div className={styles.errorAlert} role="alert">
                  {mutationError}
                </div>
              ) : null}

              {booking.status === "confirmed" ? (
                booking.canCancel ? (
                  <p className={styles.policyBox}>
                    Free to reschedule or cancel until {deadlineLabel} (
                    {booking.cancellationDeadlineHours}h before start).
                  </p>
                ) : (
                  <p className={`${styles.policyBox} ${styles.policyBoxLocked}`}>
                    Online changes closed on {deadlineLabel} (
                    {booking.cancellationDeadlineHours}h before start). Contact{" "}
                    {booking.businessName} directly if you need urgent assistance.
                  </p>
                )
              ) : booking.status === "cancelled" &&
                booking.cancelledAt &&
                !statusMessage ? (
                <p className={styles.policyBox}>
                  Cancelled on{" "}
                  {formatDeadlineLabel(booking.cancelledAt, customerTimeZone)}. This time
                  slot has been released.
                </p>
              ) : null}

              <div className={styles.ticketActions}>
                {booking.status === "confirmed" ? (
                  <button
                    type="button"
                    className={styles.quietButton}
                    onClick={() =>
                      downloadIcsFile(booking.icsContent, booking.icsFilename)
                    }
                  >
                    Download .ics calendar file
                  </button>
                ) : null}

                {booking.status !== "confirmed" || !booking.canCancel ? (
                  <Link
                    href={`/b/${booking.businessSlug}`}
                    className={styles.primaryLink}
                  >
                    Book a new appointment
                  </Link>
                ) : (
                  <Link
                    href={`/b/${booking.businessSlug}`}
                    className={styles.quietLink}
                  >
                    Book another appointment →
                  </Link>
                )}

                {booking.status === "confirmed" && booking.canCancel ? (
                  isConfirmingCancel ? (
                    <form
                      className={styles.cancelConfirmBox}
                      onSubmit={handleConfirmCancel}
                    >
                      <p className={styles.cancelConfirmTitle}>
                        Cancel this appointment?
                      </p>
                      <p className={styles.cancelConfirmText}>
                        This immediately frees your time slot for other clients.
                      </p>
                      <TurnstileField />
                      <div className={styles.cancelButtonRow}>
                        <button
                          type="button"
                          className={styles.quietButton}
                          onClick={() => {
                            setIsConfirmingCancel(false);
                            setMutationError(null);
                          }}
                          disabled={isCancelling}
                        >
                          Keep booking
                        </button>
                        <button
                          type="submit"
                          className={styles.dangerConfirmButton}
                          disabled={isCancelling}
                        >
                          {isCancelling ? "Cancelling…" : "Yes, cancel booking"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={styles.cancelTriggerButton}
                      onClick={() => {
                        setIsConfirmingCancel(true);
                        setMutationError(null);
                      }}
                    >
                      Cancel appointment
                    </button>
                  )
                ) : null}

                {booking.status === "confirmed" &&
                booking.canCancel &&
                !booking.canReschedule ? (
                  <p className={styles.tzNote}>
                    This service is no longer offered for rescheduling, though you may
                    still cancel before the deadline.
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          {/* Right: Crisp White Active Reschedule Sheet */}
          {showRescheduleBoard ? (
            <section
              className={styles.rescheduleCard}
              aria-label="Reschedule appointment"
            >
              <div className={styles.rescheduleHeader}>
                <h2 className={styles.rescheduleTitle}>Reschedule appointment</h2>
                <p className={styles.rescheduleSubtitle}>
                  Pick another open time or specialist. Moving your visit updates your
                  calendar ticket right away.
                </p>
              </div>

              <form className={styles.rescheduleForm} onSubmit={handleReschedule} noValidate>
                <div
                  className={styles.sectionGroup}
                  role="radiogroup"
                  aria-labelledby="manage-barber-label"
                >
                  <span id="manage-barber-label" className={styles.sectionLabel}>
                    Specialist
                  </span>
                  <div className={styles.barberRowList}>
                    {booking.eligibleStaff.map((member) => {
                      const isSelected = selectedStaffId === member.id;
                      return (
                        <label
                          key={member.id}
                          className={`${styles.option} ${styles.barberOption}`}
                          data-selected={isSelected ? "true" : "false"}
                        >
                          <input
                            type="radio"
                            name="manage-barber"
                            value={member.id}
                            checked={isSelected}
                            onChange={() => {
                              setSelectedStaffId(member.id);
                              setSelectedSlotIso(null);
                              setMutationError(null);
                            }}
                            className={styles.srRadio}
                          />
                          <span className={styles.avatar} aria-hidden="true">
                            {getDisplayInitials(member.display_name)}
                          </span>
                          <span className={styles.barberName}>{member.display_name}</span>
                        </label>
                      );
                    })}

                    <label
                      className={`${styles.option} ${styles.barberOption}`}
                      data-selected={selectedStaffId === null ? "true" : "false"}
                    >
                      <input
                        type="radio"
                        name="manage-barber"
                        value="anyone"
                        checked={selectedStaffId === null}
                        onChange={() => {
                          setSelectedStaffId(null);
                          setSelectedSlotIso(null);
                          setMutationError(null);
                        }}
                        className={styles.srRadio}
                      />
                      <span className={styles.avatar} aria-hidden="true">
                        Any
                      </span>
                      <span className={styles.barberName}>Anyone available</span>
                    </label>
                  </div>
                </div>

                <div className={styles.pickerGrid}>
                  <div
                    className={styles.sectionGroup}
                    role="radiogroup"
                    aria-labelledby="manage-date-label"
                  >
                    <div className={styles.sectionHeader}>
                      <span id="manage-date-label" className={styles.sectionLabel}>
                        Date
                      </span>
                      <div className={styles.datePager}>
                        <button
                          type="button"
                          className={styles.pagerButton}
                          onClick={() => handlePageDays(-DAYS_PER_PAGE)}
                          disabled={dayPageOffset === 0 || isLoadingSlots}
                          aria-label="Previous dates"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className={styles.pagerButton}
                          onClick={() => handlePageDays(DAYS_PER_PAGE)}
                          disabled={
                            dayPageOffset + DAYS_PER_PAGE >= totalHorizonDays ||
                            isLoadingSlots
                          }
                          aria-label="Next dates"
                        >
                          ›
                        </button>
                      </div>
                    </div>

                    <div className={styles.dayList}>
                      {visibleDays.map((day) => {
                        const slotCount = groupedSlots[day.dateKey]?.length ?? 0;
                        const isSelected = effectiveDateKey === day.dateKey;
                        return (
                          <label
                            key={day.dateKey}
                            className={`${styles.option} ${styles.dayOption}`}
                            data-selected={isSelected ? "true" : "false"}
                            data-empty={slotCount === 0 ? "true" : "false"}
                          >
                            <input
                              type="radio"
                              name="manage-date"
                              value={day.dateKey}
                              checked={isSelected}
                              onChange={() => {
                                setSelectedDateKey(day.dateKey);
                                setSelectedSlotIso(null);
                                setMutationError(null);
                              }}
                              className={styles.srRadio}
                            />
                            <span className={styles.dayLabel}>{day.shortLabel}</span>
                            <span className={styles.dayMeta}>
                              {slotCount > 0 ? `${slotCount} open` : "Closed"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={styles.sectionGroup}
                    role="radiogroup"
                    aria-labelledby="manage-time-label"
                  >
                    <span id="manage-time-label" className={styles.sectionLabel}>
                      Time
                    </span>

                    <div aria-live="polite">
                      {isLoadingSlots ? (
                        <p className={styles.emptyState}>Checking open times…</p>
                      ) : slotsError ? (
                        <p className={styles.emptyState}>{slotsError}</p>
                      ) : slotsForSelectedDate.length === 0 ? (
                        <p className={styles.emptyState}>
                          No open times on {activeDayOption?.shortLabel ?? "this day"}.
                          Pick another date or specialist.
                        </p>
                      ) : (
                        <div className={styles.slotsWrap}>
                          {slotsForSelectedDate.map((slot) => {
                            const isSelected =
                              effectiveSlot?.startsAtIso === slot.startsAtIso;
                            const isCurrent = isCurrentBookingSlot({
                              slot,
                              selectedStaffId,
                              bookingStaffId: booking.staffId,
                              bookingStartsAtIso: booking.startsAt,
                            });
                            return (
                              <label
                                key={slot.startsAtIso}
                                className={`${styles.option} ${styles.slotOption}`}
                                data-selected={isSelected ? "true" : "false"}
                                data-current={isCurrent ? "true" : "false"}
                              >
                                <input
                                  type="radio"
                                  name="manage-time"
                                  value={slot.startsAtIso}
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedSlotIso(slot.startsAtIso);
                                    setMutationError(null);
                                  }}
                                  className={styles.srRadio}
                                />
                                <span className={styles.slotTime}>
                                  {slot.displayTime}
                                </span>
                                {isCurrent ? (
                                  <span className={styles.slotSub}>Current slot</span>
                                ) : slot.shopTime !== slot.displayTime ? (
                                  <span className={styles.slotSub}>
                                    {slot.shopTime} shop
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <TurnstileField />

                <p className={styles.tzNote}>
                  Times shown in {customerTimeZone} (shop zone {shopTimeZone}).
                </p>

                {mutationError ? (
                  <div className={styles.errorAlert} role="alert">
                    {mutationError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={
                    isBusy ||
                    !effectiveSlot ||
                    effectiveIsSameSlot ||
                    Boolean(slotsError)
                  }
                >
                  {isRescheduling ? "Saving new time…" : confirmNewTimeLabel}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}
