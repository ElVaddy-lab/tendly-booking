"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { TurnstileField } from "@/components/turnstile-field";
import { downloadIcsFile, useCustomerTimeZone } from "@/lib/booking-client";
import {
  buildBookingDateDays,
  formatPriceCents,
  groupAvailableSlotsByDate,
  type GroupedBookingSlot,
  type RawAvailableSlot,
} from "@/lib/booking-slots";
import {
  formatBookingDateTime,
  getDisplayInitials,
} from "@/lib/manage-booking";
import {
  createPublicBookingAction,
  listPublicSlotsAction,
  type ConfirmedBookingSummary,
} from "./actions";
import styles from "./booking.module.css";
import type { PublicCatalog } from "./data";

type BookingFlowProps = {
  catalog: PublicCatalog;
  initialServiceId: string;
  initialSlots: RawAvailableSlot[];
  initialGeneratedAtIso: string;
  initialSlotsError: string | null;
};

const DAYS_PER_PAGE = 7;
const FETCH_WINDOW_DAYS = 14;

export function BookingFlow({
  catalog,
  initialServiceId,
  initialSlots,
  initialGeneratedAtIso,
  initialSlotsError,
}: BookingFlowProps) {
  const { business, services, staff, staffServices } = catalog;
  const shopTimeZone = business.timezone;
  const customerTimeZone = useCustomerTimeZone(shopTimeZone);

  const [selectedServiceId, setSelectedServiceId] = useState<string>(initialServiceId);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [hasChosenStaffManually, setHasChosenStaffManually] = useState(false);

  const [rawSlots, setRawSlots] = useState<RawAvailableSlot[]>(initialSlots);
  const [slotsError, setSlotsError] = useState<string | null>(initialSlotsError);
  const [dayPageOffset, setDayPageOffset] = useState<number>(0);
  const [loadedFromOffset, setLoadedFromOffset] = useState<number>(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<ConfirmedBookingSummary | null>(null);

  const [isLoadingSlots, startSlotsTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();

  const activeService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0] ?? null,
    [services, selectedServiceId],
  );

  const eligibleStaff = useMemo(() => {
    if (!activeService) {
      return [];
    }
    const allowedIds = new Set(
      staffServices
        .filter((link) => link.service_id === activeService.id)
        .map((link) => link.staff_id),
    );
    return staff.filter((member) => allowedIds.has(member.id));
  }, [activeService, staff, staffServices]);

  // Default to the first eligible staff member with availability until user overrides.
  const effectiveStaffId = useMemo<string | null>(() => {
    if (hasChosenStaffManually) {
      if (selectedStaffId === null) {
        return null;
      }
      return eligibleStaff.some((m) => m.id === selectedStaffId)
        ? selectedStaffId
        : null;
    }
    return null;
  }, [hasChosenStaffManually, selectedStaffId, eligibleStaff]);

  const filteredSlots = useMemo(() => {
    if (!effectiveStaffId) {
      return rawSlots;
    }
    return rawSlots.filter((slot) => slot.staff_id === effectiveStaffId);
  }, [rawSlots, effectiveStaffId]);

  const groupedSlots = useMemo(
    () => groupAvailableSlotsByDate(filteredSlots, customerTimeZone, shopTimeZone),
    [filteredSlots, customerTimeZone, shopTimeZone],
  );

  const anchorInstant = useMemo(() => new Date(initialGeneratedAtIso), [initialGeneratedAtIso]);
  const totalHorizonDays = Math.max(1, business.booking_horizon_days);

  const allHorizonDays = useMemo(
    () =>
      buildBookingDateDays(
        anchorInstant,
        Math.min(totalHorizonDays, Math.max(loadedFromOffset + FETCH_WINDOW_DAYS, dayPageOffset + DAYS_PER_PAGE)),
        customerTimeZone,
      ),
    [anchorInstant, totalHorizonDays, loadedFromOffset, dayPageOffset, customerTimeZone],
  );

  const visibleDays = useMemo(
    () => allHorizonDays.slice(dayPageOffset, dayPageOffset + DAYS_PER_PAGE),
    [allHorizonDays, dayPageOffset],
  );

  const effectiveDateKey = useMemo(() => {
    if (
      selectedDateKey &&
      visibleDays.some((day) => day.dateKey === selectedDateKey)
    ) {
      return selectedDateKey;
    }
    const firstWithSlots = visibleDays.find(
      (day) => (groupedSlots[day.dateKey]?.length ?? 0) > 0,
    );
    if (firstWithSlots) {
      return firstWithSlots.dateKey;
    }
    const horizonWithSlots = allHorizonDays.find(
      (day) => (groupedSlots[day.dateKey]?.length ?? 0) > 0,
    );
    if (horizonWithSlots && visibleDays.some((d) => d.dateKey === horizonWithSlots.dateKey)) {
      return horizonWithSlots.dateKey;
    }
    return visibleDays[0]?.dateKey ?? null;
  }, [selectedDateKey, visibleDays, groupedSlots, allHorizonDays]);

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
    return slotsForSelectedDate[0] ?? null;
  }, [slotsForSelectedDate, selectedSlotIso]);

  const activeDayOption = useMemo(
    () => visibleDays.find((day) => day.dateKey === effectiveDateKey) ?? visibleDays[0] ?? null,
    [visibleDays, effectiveDateKey],
  );

  const activeStaffLabel = useMemo(() => {
    if (!effectiveStaffId) {
      return "Anyone available";
    }
    return (
      eligibleStaff.find((member) => member.id === effectiveStaffId)?.display_name ??
      "Anyone available"
    );
  }, [effectiveStaffId, eligibleStaff]);

  function refreshSlotsFor(serviceId: string, windowStartDayOffset: number) {
    const windowFrom = new Date(
      anchorInstant.getTime() + windowStartDayOffset * 24 * 60 * 60 * 1000,
    );
    startSlotsTransition(async () => {
      const response = await listPublicSlotsAction({
        businessId: business.id,
        serviceId,
        staffId: null,
        fromIso: windowStartDayOffset === 0 ? undefined : windowFrom.toISOString(),
      });
      setRawSlots(response.slots);
      setSlotsError(response.error);
      setLoadedFromOffset(windowStartDayOffset);
    });
  }

  function handleServiceChange(nextServiceId: string) {
    setSelectedServiceId(nextServiceId);
    setHasChosenStaffManually(false);
    setSelectedStaffId(null);
    setSelectedDateKey(null);
    setSelectedSlotIso(null);
    setFormError(null);
    refreshSlotsFor(nextServiceId, loadedFromOffset);
  }

  function handleBarberChange(nextStaffId: string | null) {
    setHasChosenStaffManually(true);
    setSelectedStaffId(nextStaffId);
    setSelectedSlotIso(null);
    setFormError(null);
  }

  function handleDayChange(nextDateKey: string) {
    setSelectedDateKey(nextDateKey);
    setSelectedSlotIso(null);
    setFormError(null);
  }

  function handlePageDays(delta: number) {
    if (!activeService) {
      return;
    }
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
      refreshSlotsFor(activeService.id, nextOffset);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeService || !effectiveSlot) {
      setFormError("Pick an available date and time slot first.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

    setFormError(null);
    setFieldErrors({});

    startSubmitTransition(async () => {
      const result = await createPublicBookingAction({
        businessId: business.id,
        slug: business.slug,
        serviceId: activeService.id,
        staffId: effectiveStaffId,
        startsAt: effectiveSlot.startsAtIso,
        customerName,
        customerEmail,
        customerPhone,
        customerTimezone: customerTimeZone,
        notes,
        turnstileToken,
      });

      if (result.error || !result.booking) {
        setFormError(result.error ?? "Could not complete your booking.");
        setFieldErrors(result.fieldErrors ?? {});
        if (result.code === "slot_unavailable") {
          setSelectedSlotIso(null);
          refreshSlotsFor(activeService.id, loadedFromOffset);
        }
        return;
      }

      setConfirmed(result.booking);
      setFormError(null);
      setFieldErrors({});
      refreshSlotsFor(activeService.id, loadedFromOffset);
    });
  }

  if (services.length === 0) {
    return (
      <>
        <header className={styles.topBar}>
          <div className={styles.brandCluster}>
            <Link href="/" className={styles.wordmark}>
              Tendly
            </Link>
            <span className={styles.slugCrumb}>/b/{business.slug}</span>
          </div>
          <div className={styles.businessHeader}>
            <h1 className={styles.businessName}>{business.name}</h1>
            {business.is_demo ? (
              <span className={styles.demoTag}>Demo business · fictional</span>
            ) : null}
          </div>
          <div className={styles.timezoneWrap}>
            <span className={styles.timezonePill}>Shop time: {shopTimeZone}</span>
          </div>
        </header>
        <main className={styles.main}>
          <section className={styles.noServicesCard}>
            <h2 className={styles.ticketHeading}>Online booking opens soon</h2>
            <p className={styles.ticketSub}>
              {business.name} has not published active services yet. Check back shortly.
            </p>
          </section>
        </main>
      </>
    );
  }

  const confirmButtonLabel = effectiveSlot
    ? `Confirm booking · ${effectiveSlot.shortDateLabel} ${effectiveSlot.displayTime}`
    : "Select a time slot";

  const confirmedClock = confirmed
    ? formatBookingDateTime(confirmed.startsAt, customerTimeZone)
    : null;

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.brandCluster}>
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <span className={styles.slugCrumb}>/b/{business.slug}</span>
        </div>

        <div className={styles.businessHeader}>
          <h1 className={styles.businessName}>{business.name}</h1>
          {business.is_demo ? (
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
        <section className={styles.ledgerCard} aria-label="Choose appointment">
          <div className={styles.ledgerGrid}>
            {/* Column 1: Services */}
            <div
              className={styles.column}
              role="radiogroup"
              aria-labelledby="booking-col-services"
            >
              <div className={styles.columnHeader}>
                <span id="booking-col-services" className={styles.columnLabel}>
                  Services
                </span>
              </div>
              <div className={styles.optionList}>
                {services.map((service) => {
                  const isSelected = activeService?.id === service.id;
                  const priceLabel = formatPriceCents(
                    service.price_cents,
                    service.currency,
                  );
                  return (
                    <label
                      key={service.id}
                      className={`${styles.option} ${styles.serviceOption}`}
                      data-selected={isSelected ? "true" : "false"}
                    >
                      <input
                        type="radio"
                        name="booking-service"
                        value={service.id}
                        checked={isSelected}
                        onChange={() => handleServiceChange(service.id)}
                        className={styles.srRadio}
                      />
                      <span className={styles.serviceName}>{service.name}</span>
                      <span className={styles.serviceMeta}>
                        {service.duration_min} min
                        {priceLabel ? ` · ${priceLabel}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Barber */}
            <div
              className={styles.column}
              role="radiogroup"
              aria-labelledby="booking-col-barber"
            >
              <div className={styles.columnHeader}>
                <span id="booking-col-barber" className={styles.columnLabel}>
                  Barber
                </span>
              </div>
              <div className={styles.optionList}>
                {eligibleStaff.map((member) => {
                  const isSelected = effectiveStaffId === member.id;
                  return (
                    <label
                      key={member.id}
                      className={`${styles.option} ${styles.barberOption}`}
                      data-selected={isSelected ? "true" : "false"}
                    >
                      <input
                        type="radio"
                        name="booking-barber"
                        value={member.id}
                        checked={isSelected}
                        onChange={() => handleBarberChange(member.id)}
                        className={styles.srRadio}
                      />
                      <span className={styles.avatar} aria-hidden="true">
                        {getDisplayInitials(member.display_name)}
                      </span>
                      <span className={styles.barberCopy}>
                        <span className={styles.barberName}>{member.display_name}</span>
                      </span>
                    </label>
                  );
                })}

                <label
                  className={`${styles.option} ${styles.barberOption}`}
                  data-selected={effectiveStaffId === null ? "true" : "false"}
                >
                  <input
                    type="radio"
                    name="booking-barber"
                    value="anyone"
                    checked={effectiveStaffId === null}
                    onChange={() => handleBarberChange(null)}
                    className={styles.srRadio}
                  />
                  <span className={styles.avatar} aria-hidden="true">
                    Any
                  </span>
                  <span className={styles.barberCopy}>
                    <span className={styles.barberName}>Anyone available</span>
                    <span className={styles.barberHint}>First open specialist</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Column 3: Date */}
            <div
              className={styles.column}
              role="radiogroup"
              aria-labelledby="booking-col-date"
            >
              <div className={styles.columnHeader}>
                <span id="booking-col-date" className={styles.columnLabel}>
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

              <div className={styles.optionList}>
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
                        name="booking-date"
                        value={day.dateKey}
                        checked={isSelected}
                        onChange={() => handleDayChange(day.dateKey)}
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

            {/* Column 4: Time */}
            <div
              className={styles.column}
              role="radiogroup"
              aria-labelledby="booking-col-time"
            >
              <div className={styles.columnHeader}>
                <span id="booking-col-time" className={styles.columnLabel}>
                  Time
                </span>
              </div>

              <div aria-live="polite">
                {isLoadingSlots ? (
                  <p className={styles.emptyState}>Checking live times…</p>
                ) : slotsError ? (
                  <p className={styles.emptyState}>{slotsError}</p>
                ) : slotsForSelectedDate.length === 0 ? (
                  <p className={styles.emptyState}>
                    No open times on {activeDayOption?.shortLabel ?? "this day"}. Try
                    another date or pick Anyone available.
                  </p>
                ) : (
                  <div className={styles.slotsWrap}>
                    {slotsForSelectedDate.map((slot) => {
                      const isSelected = effectiveSlot?.startsAtIso === slot.startsAtIso;
                      return (
                        <label
                          key={slot.startsAtIso}
                          className={`${styles.option} ${styles.slotOption}`}
                          data-selected={isSelected ? "true" : "false"}
                        >
                          <input
                            type="radio"
                            name="booking-time"
                            value={slot.startsAtIso}
                            checked={isSelected}
                            onChange={() => {
                              setSelectedSlotIso(slot.startsAtIso);
                              setFormError(null);
                            }}
                            className={styles.srRadio}
                          />
                          <span className={styles.slotTime}>{slot.displayTime}</span>
                          {slot.shopTime !== slot.displayTime ? (
                            <span className={styles.slotShopTime}>
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
        </section>

        <div className={styles.lowerGrid}>
          {/* Lower Left: Pure White Client Details Card */}
          <section className={styles.detailsCard} aria-label="Client details">
            <form className={styles.detailsForm} onSubmit={handleSubmit} noValidate>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label htmlFor="booking-customer-name" className={styles.fieldLabel}>
                    Your name
                  </label>
                  <input
                    id="booking-customer-name"
                    name="customerName"
                    type="text"
                    required
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Alex Kowalski"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className={styles.underlineInput}
                    aria-invalid={fieldErrors.customerName ? "true" : undefined}
                  />
                  {fieldErrors.customerName ? (
                    <p className={styles.fieldError}>{fieldErrors.customerName}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="booking-customer-email" className={styles.fieldLabel}>
                    Email
                  </label>
                  <input
                    id="booking-customer-email"
                    name="customerEmail"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="alex@example.com"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    className={styles.underlineInput}
                    aria-invalid={fieldErrors.customerEmail ? "true" : undefined}
                  />
                  {fieldErrors.customerEmail ? (
                    <p className={styles.fieldError}>{fieldErrors.customerEmail}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="booking-customer-phone" className={styles.fieldLabel}>
                    Phone (optional)
                  </label>
                  <input
                    id="booking-customer-phone"
                    name="customerPhone"
                    type="tel"
                    maxLength={32}
                    autoComplete="tel"
                    placeholder="+48 500 100 200"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    className={styles.underlineInput}
                    aria-invalid={fieldErrors.customerPhone ? "true" : undefined}
                  />
                  {fieldErrors.customerPhone ? (
                    <p className={styles.fieldError}>{fieldErrors.customerPhone}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="booking-notes" className={styles.fieldLabel}>
                    Notes (optional)
                  </label>
                  <input
                    id="booking-notes"
                    name="notes"
                    type="text"
                    maxLength={1000}
                    placeholder="Fade preference or request"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={styles.underlineInput}
                    aria-invalid={fieldErrors.notes ? "true" : undefined}
                  />
                  {fieldErrors.notes ? (
                    <p className={styles.fieldError}>{fieldErrors.notes}</p>
                  ) : null}
                </div>
              </div>

              <TurnstileField />

              <p className={styles.tzNote}>
                Slots calculated in {shopTimeZone} · displayed in your local time (
                {customerTimeZone})
              </p>

              {formError ? (
                <div className={styles.errorAlert} role="alert">
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                className={styles.confirmButton}
                disabled={isSubmitting || isLoadingSlots || !effectiveSlot}
              >
                {isSubmitting ? "Confirming booking…" : confirmButtonLabel}
              </button>
            </form>
          </section>

          {/* Lower Right: Perforated Warm Paper Ticket Stub */}
          <div className={styles.ticketShadowWrap}>
            <section
              className={styles.ticketStub}
              aria-label="Booking confirmation ticket"
              aria-live="polite"
            >
              {confirmed && confirmedClock ? (
                <>
                  <span className={styles.confirmedStatus}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    Confirmed
                  </span>
                  <h2 className={styles.ticketHeading}>
                    Booking confirmed · {confirmedClock.dateLabel} at{" "}
                    {confirmedClock.timeLabel}
                  </h2>
                  <p className={styles.ticketSub}>
                    {confirmed.serviceName} ({confirmed.durationMin} min
                    {confirmed.priceLabel ? ` · ${confirmed.priceLabel}` : ""}) with{" "}
                    {confirmed.staffName}
                  </p>
                  <button
                    type="button"
                    className={styles.downloadIcsButton}
                    onClick={() =>
                      downloadIcsFile(confirmed.icsContent, confirmed.icsFilename)
                    }
                  >
                    Download .ics calendar file
                  </button>
                  <Link href={confirmed.managePath} className={styles.manageLink}>
                    Manage or cancel booking →
                  </Link>
                  <p className={styles.deadlineNote}>
                    Cancel or reschedule up to {business.cancellation_deadline_hours}h
                    before
                  </p>
                  <button
                    type="button"
                    className={styles.bookAnother}
                    onClick={() => {
                      setConfirmed(null);
                      setFormError(null);
                    }}
                  >
                    Book another appointment
                  </button>
                </>
              ) : (
                <>
                  <p className={styles.ticketEyebrow}>Appointment Ticket</p>
                  <h2 className={styles.ticketHeading}>
                    {effectiveSlot
                      ? `${activeService?.name ?? "Appointment"} · ${effectiveSlot.fullDateLabel} at ${effectiveSlot.displayTime}`
                      : "Pick a date and open time"}
                  </h2>
                  <p className={styles.ticketSub}>
                    {effectiveSlot
                      ? `${activeStaffLabel} · ${activeService?.duration_min ?? 30} min`
                      : "Your confirmation ticket and calendar file appear here once booked."}
                  </p>
                  <p className={styles.deadlineNote}>
                    Cancel or reschedule up to {business.cancellation_deadline_hours}h
                    before
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
