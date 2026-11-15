"use client";

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
    <section className={styles.card} aria-labelledby={`${uid}-title`}>
      <div className={styles.cardHead}>
        <p className={styles.stepLabel}>Step 1 of 2 · Business details</p>
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

        <button type="submit" disabled={pending} className={styles.submit}>
          {pending ? "Saving business…" : "Continue"}
        </button>
      </form>
    </section>
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

  return (
    <section className={styles.card} aria-labelledby={`${uid}-title`}>
      <div className={styles.cardHead}>
        <p className={styles.stepLabel}>Step 2 of 2 · First service &amp; working hours</p>
        <h1 id={`${uid}-title`} className={styles.title}>
          Open your first chair
        </h1>
        <p className={styles.businessSummary}>
          {business.name} · /b/{business.slug} · {business.timezone}
        </p>
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
            placeholder="Andriy"
            className={styles.input}
          />
          <p className={styles.hint}>Shown to clients when they pick who to book.</p>
          {state.fieldErrors?.staffName && (
            <p className={styles.fieldError}>{state.fieldErrors.staffName}</p>
          )}
        </div>

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
            defaultValue="Haircut"
            className={styles.input}
          />
          {state.fieldErrors?.serviceName && (
            <p className={styles.fieldError}>{state.fieldErrors.serviceName}</p>
          )}
        </div>

        <div className={styles.rowThree}>
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
              defaultValue={30}
              className={styles.input}
            />
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
              defaultValue={10}
              className={styles.input}
            />
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
              defaultValue="35"
              placeholder="35"
              className={styles.input}
            />
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
                  defaultChecked={day.value <= 5}
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
              defaultValue="09:00"
              className={styles.input}
            />
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
              defaultValue="18:00"
              className={styles.input}
            />
          </div>
        </div>

        {state.error && (
          <p className={styles.error} role="alert" aria-live="polite">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={styles.submit}>
          {pending ? "Finishing setup…" : "Finish setup"}
        </button>
      </form>
    </section>
  );
}
