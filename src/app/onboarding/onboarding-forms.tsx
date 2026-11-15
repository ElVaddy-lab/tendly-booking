"use client";

import { Check, CircleDot } from "lucide-react";
import { useActionState, useId, useState, useSyncExternalStore } from "react";

import { slugifyBusinessName } from "@/lib/slug";

import {
  completeOnboardingAction,
  createBusinessAction,
  type OnboardingActionState,
} from "./actions";
import styles from "./onboarding.module.css";

const initialState: OnboardingActionState = { error: null };

const COMMON_TIMEZONES = [
  "Europe/Kyiv",
  "Europe/Warsaw",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
] as const;

const subscribeNoop = () => () => {};

function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Kyiv";
}

function getServerTimeZone(): string {
  return "Europe/Kyiv";
}

function ProgressRail({
  activeStep,
  businessName,
  slug,
  timezone,
}: {
  activeStep: 1 | 2;
  businessName: string;
  slug: string;
  timezone: string;
}) {
  return (
    <aside className={styles.rail} aria-label="Setup steps">
      <ol className={styles.stepList}>
        <li className={`${styles.stepItem} ${activeStep === 1 ? styles.stepItemActive : styles.stepItemDone}`}>
          <div className={styles.stepLineColumn} aria-hidden="true">
            <span className={styles.stepBadge}>
              {activeStep === 2 ? <Check className={styles.stepIcon} strokeWidth={2} /> : <CircleDot className={styles.stepIcon} strokeWidth={1.75} />}
            </span>
            <span className={styles.stepConnector} />
          </div>
          <div className={styles.stepContent}>
            <span className={styles.stepHeading}>
              1. Shop &amp; link
            </span>
            <span className={styles.stepMeta}>{businessName || "Your shop"}</span>
            <span className={styles.stepMeta}>/b/{slug || "northside-barbers"}</span>
            <span className={styles.stepMeta}>{timezone}</span>
          </div>
        </li>

        <li className={`${styles.stepItem} ${activeStep === 2 ? styles.stepItemActive : styles.stepItemMuted}`}>
          <div className={styles.stepLineColumn} aria-hidden="true">
            <span className={styles.stepBadge}>
              <CircleDot className={styles.stepIcon} strokeWidth={1.75} />
            </span>
          </div>
          <div className={styles.stepContent}>
            <span className={styles.stepHeading}>2. First service &amp; hours</span>
            <span className={styles.stepMeta}>First chair &amp; weekly opening hours</span>
          </div>
        </li>
      </ol>

      {activeStep === 2 ? (
        <details className={styles.railBackDetails}>
          <summary className={styles.railBackSummary}>← Back to Step 1 details</summary>
          <p className={styles.railBackNote}>
            Saved shop details: <strong>{businessName}</strong> at <code>/b/{slug}</code> ({timezone}).
            You can adjust shop details anytime after setup.
          </p>
        </details>
      ) : null}
    </aside>
  );
}

export function BusinessStepForm() {
  const uid = useId();
  const [state, formAction, pending] = useActionState(createBusinessAction, initialState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const detectedZone = useSyncExternalStore(
    subscribeNoop,
    getBrowserTimeZone,
    getServerTimeZone,
  );
  const [pickedZone, setPickedZone] = useState<string | null>(null);
  const timezone = pickedZone ?? detectedZone;

  const zoneOptions = COMMON_TIMEZONES.includes(
    timezone as (typeof COMMON_TIMEZONES)[number],
  )
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugifyBusinessName(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase());
  }

  return (
    <div className={styles.workbench}>
      <ProgressRail activeStep={1} businessName={name} slug={slug} timezone={timezone} />

      <section className={styles.card} aria-labelledby={`${uid}-title`}>
        <div className={styles.cardHead}>
          <h1 id={`${uid}-title`} className={styles.title}>
            Name your booking page
          </h1>
        </div>

        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor={`${uid}-name`} className={styles.label}>
              Business name
            </label>
            <input
              id={`${uid}-name`}
              name="name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Northside Barbers"
              className={styles.input}
            />
            {state.fieldErrors?.name && (
              <p className={styles.fieldError}>{state.fieldErrors.name}</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={`${uid}-slug`} className={styles.label}>
              Public booking URL
            </label>
            <div className={styles.slugBox}>
              <span className={styles.slugPrefix} aria-hidden="true">
                /b/
              </span>
              <input
                id={`${uid}-slug`}
                name="slug"
                type="text"
                required
                minLength={3}
                maxLength={48}
                value={slug}
                onChange={(event) => handleSlugChange(event.target.value)}
                placeholder="northside-barbers"
                aria-describedby={`${uid}-slug-hint`}
                className={styles.slugInput}
              />
            </div>
            <p id={`${uid}-slug-hint`} className={styles.hint}>
              Use 3–48 lowercase letters, numbers, or hyphens.
            </p>
            {state.fieldErrors?.slug && (
              <p className={styles.fieldError}>{state.fieldErrors.slug}</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={`${uid}-timezone`} className={styles.label}>
              Shop time zone
            </label>
            <select
              id={`${uid}-timezone`}
              name="timezone"
              value={timezone}
              onChange={(event) => setPickedZone(event.target.value)}
              className={styles.select}
            >
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className={styles.hint}>
              Working hours stay anchored to this time zone across daylight saving changes.
            </p>
            {state.fieldErrors?.timezone && (
              <p className={styles.fieldError}>{state.fieldErrors.timezone}</p>
            )}
          </div>

          {state.error && (
            <p className={styles.error} role="alert" aria-live="polite">
              {state.error}
            </p>
          )}

          <div className={styles.submitRow}>
            <button type="submit" disabled={pending} className={styles.submit}>
              {pending ? "Saving business…" : "Continue"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ServiceScheduleStepForm({
  business,
}: {
  business: { id: string; name: string; slug: string; timezone: string };
}) {
  const uid = useId();
  const [state, formAction, pending] = useActionState(
    completeOnboardingAction,
    initialState,
  );
  const [staffName, setStaffName] = useState("");
  const [serviceName, setServiceName] = useState("Haircut");
  const [priceDollars, setPriceDollars] = useState("35");
  const [durationMin, setDurationMin] = useState("30");
  const [bufferMin, setBufferMin] = useState("10");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  function toggleWeekday(dayValue: number) {
    setSelectedWeekdays((prev) =>
      prev.includes(dayValue)
        ? prev.filter((item) => item !== dayValue)
        : [...prev, dayValue],
    );
  }

  return (
    <div className={styles.workbench}>
      <ProgressRail
        activeStep={2}
        businessName={business.name}
        slug={business.slug}
        timezone={business.timezone}
      />

      <section className={styles.card} aria-labelledby={`${uid}-title`}>
        <div className={styles.cardHead}>
          <h1 id={`${uid}-title`} className={styles.title}>
            Open your first chair
          </h1>
        </div>

        <form action={formAction} className={styles.form}>
          <input type="hidden" name="businessId" value={business.id} />

          <div className={styles.field}>
            <label htmlFor={`${uid}-staff`} className={styles.label}>
              Your display name
            </label>
            <input
              id={`${uid}-staff`}
              name="staffName"
              type="text"
              required
              maxLength={60}
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
              placeholder="Andriy"
              className={styles.input}
            />
            <p className={styles.hint}>Shown to clients when they pick who to book.</p>
            {state.fieldErrors?.staffName && (
              <p className={styles.fieldError}>{state.fieldErrors.staffName}</p>
            )}
          </div>

          <div className={styles.rowTwo}>
            <div className={styles.field}>
              <label htmlFor={`${uid}-service`} className={styles.label}>
                First service
              </label>
              <input
                id={`${uid}-service`}
                name="serviceName"
                type="text"
                required
                maxLength={80}
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                className={styles.input}
              />
              {state.fieldErrors?.serviceName && (
                <p className={styles.fieldError}>{state.fieldErrors.serviceName}</p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-price`} className={styles.label}>
                Price (USD)
              </label>
              <input
                id={`${uid}-price`}
                name="priceDollars"
                type="text"
                inputMode="decimal"
                value={priceDollars}
                onChange={(event) => setPriceDollars(event.target.value)}
                placeholder="35"
                className={styles.input}
              />
              {state.fieldErrors?.priceDollars && (
                <p className={styles.fieldError}>{state.fieldErrors.priceDollars}</p>
              )}
            </div>
          </div>

          <div className={styles.rowTwo}>
            <div className={styles.field}>
              <label htmlFor={`${uid}-duration`} className={styles.label}>
                Duration (min)
              </label>
              <input
                id={`${uid}-duration`}
                name="durationMin"
                type="number"
                required
                min={5}
                max={480}
                value={durationMin}
                onChange={(event) => setDurationMin(event.target.value)}
                className={styles.input}
              />
              {state.fieldErrors?.durationMin && (
                <p className={styles.fieldError}>{state.fieldErrors.durationMin}</p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-buffer`} className={styles.label}>
                Buffer (min)
              </label>
              <input
                id={`${uid}-buffer`}
                name="bufferMin"
                type="number"
                required
                min={0}
                max={120}
                value={bufferMin}
                onChange={(event) => setBufferMin(event.target.value)}
                className={styles.input}
              />
              <p className={styles.hint}>Breathing room between appointments</p>
              {state.fieldErrors?.bufferMin && (
                <p className={styles.fieldError}>{state.fieldErrors.bufferMin}</p>
              )}
            </div>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Working days</legend>
            <div className={styles.daysGrid}>
              {WEEKDAYS.map((day) => (
                <label key={day.value} className={styles.dayChip}>
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={day.value}
                    checked={selectedWeekdays.includes(day.value)}
                    onChange={() => toggleWeekday(day.value)}
                    aria-label={day.label}
                  />
                  <span aria-hidden="true">{day.short}</span>
                </label>
              ))}
            </div>
            {state.fieldErrors?.weekdays && (
              <p className={styles.fieldError}>{state.fieldErrors.weekdays}</p>
            )}
          </fieldset>

          <div className={styles.rowTwo}>
            <div className={styles.field}>
              <label htmlFor={`${uid}-start`} className={styles.label}>
                Opens
              </label>
              <input
                id={`${uid}-start`}
                name="startTime"
                type="time"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={styles.input}
              />
              {state.fieldErrors?.startTime && (
                <p className={styles.fieldError}>{state.fieldErrors.startTime}</p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-end`} className={styles.label}>
                Closes
              </label>
              <input
                id={`${uid}-end`}
                name="endTime"
                type="time"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={styles.input}
              />
              {state.fieldErrors?.endTime && (
                <p className={styles.fieldError}>{state.fieldErrors.endTime}</p>
              )}
            </div>
          </div>

          {state.error && (
            <p className={styles.error} role="alert" aria-live="polite">
              {state.error}
            </p>
          )}

          <div className={styles.submitRow}>
            <button type="submit" disabled={pending} className={styles.submit}>
              {pending ? "Finishing setup…" : "Finish setup"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
