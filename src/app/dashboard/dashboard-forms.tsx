"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import {
  createCheckoutSessionAction,
  createInvitationAction,
  createPortalSessionAction,
  createServiceAction,
  createStaffAction,
  createTelegramLinkCodeAction,
  createTimeOffAction,
  deleteServiceAction,
  deleteTimeOffAction,
  revokeInvitationAction,
  revokeStaffIcsTokenAction,
  rotateStaffIcsTokenAction,
  toggleServiceActiveAction,
  toggleStaffActiveAction,
  unlinkStaffTelegramAction,
  updateServiceStaffAction,
  updateStaffScheduleAction,
  type DashboardActionState,
} from "./actions";
import type { BusinessPlanUsage } from "@/lib/stripe-billing";
import styles from "./dashboard.module.css";

const INITIAL_STATE: DashboardActionState = { error: null };

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

type StaffOption = {
  id: string;
  display_name: string;
  is_active: boolean;
  member_user_id: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
  is_active: boolean;
};

type ScheduleWindow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

const emptySubscribe = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => "";

export function CopyBookingLinkButton({ publicPath }: { publicPath: string }) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    emptySubscribe,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );

  async function handleCopy() {
    const url = `${origin}${publicPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={styles.sidebarPrimaryButton}
    >
      {copied ? "Copied booking link" : "Copy booking link"}
    </button>
  );
}

function ActionFeedback({ state }: { state: DashboardActionState }) {
  if (state.error) {
    return (
      <p className={styles.alertError} role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className={styles.alertSuccess} role="status">
        {state.success}
      </p>
    );
  }
  return null;
}

type InlineActionName =
  | "toggleService"
  | "deleteService"
  | "toggleStaff"
  | "deleteTimeOff"
  | "revokeInvite";

const INLINE_ACTIONS: Record<
  InlineActionName,
  (prevState: DashboardActionState, formData: FormData) => Promise<DashboardActionState>
> = {
  toggleService: toggleServiceActiveAction,
  deleteService: deleteServiceAction,
  toggleStaff: toggleStaffActiveAction,
  deleteTimeOff: deleteTimeOffAction,
  revokeInvite: revokeInvitationAction,
};

export function InlineActionButton({
  actionName,
  fields,
  label,
  pendingLabel,
  ariaLabel,
  variant = "secondary",
}: {
  actionName: InlineActionName;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  ariaLabel?: string;
  variant?: "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(
    INLINE_ACTIONS[actionName],
    INITIAL_STATE,
  );

  return (
    <div className={styles.inlineFormStack}>
      <form action={formAction}>
        {Object.entries(fields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <button
          type="submit"
          disabled={pending}
          aria-label={ariaLabel}
          className={variant === "danger" ? styles.dangerButton : styles.secondaryButton}
        >
          {pending ? pendingLabel : label}
        </button>
      </form>
      {state.error ? (
        <p className={styles.alertError} role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

export function ServiceStaffEditor({
  businessId,
  serviceId,
  serviceName,
  staff,
  assignedStaffIds,
}: {
  businessId: string;
  serviceId: string;
  serviceName: string;
  staff: StaffOption[];
  assignedStaffIds: string[];
}) {
  const [state, formAction, actionPending] = useActionState(
    updateServiceStaffAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const assignedSet = new Set(assignedStaffIds);

  return (
    <details className={styles.inlineDisclosure}>
      <summary className={styles.disclosureTrigger}>
        Assign staff ({assignedStaffIds.length})
      </summary>
      <div className={styles.disclosureBody}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => {
              formAction(formData);
            });
          }}
          className={styles.formStack}
        >
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="serviceId" value={serviceId} />
          <fieldset className={styles.checkboxFieldset}>
            <legend className={styles.checkboxLegend}>
              Staff performing {serviceName}
            </legend>
            <div className={styles.checkboxGrid}>
              {staff.map((member) => (
                <label key={member.id} className={styles.checkboxPill}>
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={member.id}
                    defaultChecked={assignedSet.has(member.id)}
                    className={styles.checkboxInput}
                  />
                  <span>
                    {member.display_name}
                    {!member.is_active ? " (inactive)" : ""}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <ActionFeedback state={state} />
          <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
            {pending ? "Saving..." : "Save staff assignments"}
          </button>
        </form>
      </div>
    </details>
  );
}

export function AddServiceForm({
  businessId,
  staff,
}: {
  businessId: string;
  staff: StaffOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, actionPending] = useActionState(
    createServiceAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (!state.error && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <section className={styles.activeEditorCard} aria-labelledby="add-service-heading">
      <h3 id="add-service-heading" className={styles.subsectionTitle}>
        Add service
      </h3>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => {
            formAction(formData);
          });
        }}
        className={styles.formStack}
      >
        <input type="hidden" name="businessId" value={businessId} />
        <div className={styles.fieldGrid}>
          <div className={`${styles.fieldGroup} ${styles.fieldGroupFull}`}>
            <label htmlFor="new-service-name" className={styles.label}>
              Service name
            </label>
            <input
              id="new-service-name"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="Beard trim"
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="new-service-duration" className={styles.label}>
              Duration (min)
            </label>
            <input
              id="new-service-duration"
              name="durationMin"
              type="number"
              required
              min={5}
              max={480}
              defaultValue={30}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="new-service-buffer" className={styles.label}>
              Buffer (min)
            </label>
            <input
              id="new-service-buffer"
              name="bufferMin"
              type="number"
              min={0}
              max={120}
              defaultValue={0}
              className={styles.input}
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.fieldGroupFull}`}>
            <label htmlFor="new-service-price" className={styles.label}>
              Price in USD (optional)
            </label>
            <input
              id="new-service-price"
              name="priceDollars"
              type="text"
              inputMode="decimal"
              placeholder="35.00 or leave blank"
              className={styles.input}
            />
          </div>
        </div>

        {staff.length > 0 ? (
          <fieldset className={styles.checkboxFieldset}>
            <legend className={styles.checkboxLegend}>Assigned staff</legend>
            <div className={styles.checkboxGrid}>
              {staff.map((member) => (
                <label key={member.id} className={styles.checkboxPill}>
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={member.id}
                    defaultChecked={member.is_active}
                    className={styles.checkboxInput}
                  />
                  <span>{member.display_name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <ActionFeedback state={state} />

        <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
          {pending ? "Adding..." : "Add service"}
        </button>
      </form>
    </section>
  );
}

export function StaffScheduleEditor({
  businessId,
  staffId,
  staffName,
  initialHours,
}: {
  businessId: string;
  staffId: string;
  staffName: string;
  initialHours: ScheduleWindow[];
}) {
  const [state, formAction, actionPending] = useActionState(
    updateStaffScheduleAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const nextIdRef = useRef(0);
  const [windows, setWindows] = useState<ScheduleWindow[]>(() =>
    initialHours.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
    })),
  );

  function addWindow() {
    nextIdRef.current += 1;
    const id = `new-${staffId}-${nextIdRef.current}`;
    setWindows((prev) => {
      if (prev.length === 0) {
        return [{ id, weekday: 1, start_time: "09:00", end_time: "17:00" }];
      }
      const last = prev[prev.length - 1];
      if (last.end_time <= "13:00") {
        return [...prev, { id, weekday: last.weekday, start_time: "14:00", end_time: "18:00" }];
      }
      return [
        ...prev,
        {
          id,
          weekday: (last.weekday % 7) + 1,
          start_time: "09:00",
          end_time: "17:00",
        },
      ];
    });
  }

  function applyWeekdayPreset() {
    setWindows(
      [1, 2, 3, 4, 5].map((weekday) => {
        nextIdRef.current += 1;
        return {
          id: `preset-${staffId}-${nextIdRef.current}`,
          weekday,
          start_time: "09:00",
          end_time: "17:00",
        };
      }),
    );
  }

  function updateRow(
    id: string,
    patch: Partial<Pick<ScheduleWindow, "weekday" | "start_time" | "end_time">>,
  ) {
    setWindows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setWindows((prev) => prev.filter((row) => row.id !== id));
  }

  const serializedHours = JSON.stringify(
    windows.map((row) => ({
      weekday: row.weekday,
      start_time: row.start_time,
      end_time: row.end_time,
    })),
  );

  return (
    <details className={styles.inlineDisclosure}>
      <summary className={styles.disclosureTrigger}>Edit weekly hours</summary>
      <div className={styles.disclosureBody}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => {
              formAction(formData);
            });
          }}
          className={styles.formStack}
        >
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="hoursJson" value={serializedHours} />

          <div className={styles.scheduleToolbar}>
            <button type="button" onClick={addWindow} className={styles.secondaryButton}>
              + Add window
            </button>
            <button
              type="button"
              onClick={applyWeekdayPreset}
              className={styles.secondaryButton}
            >
              Mon–Fri 09:00–17:00
            </button>
          </div>

          {windows.length > 0 ? (
            <div className={styles.scheduleRows}>
              {windows.map((row, index) => (
                <div key={row.id} className={styles.scheduleRow}>
                  <select
                    aria-label={`Window ${index + 1} day for ${staffName}`}
                    value={row.weekday}
                    onChange={(event) =>
                      updateRow(row.id, { weekday: Number(event.target.value) })
                    }
                    className={`${styles.select} ${styles.scheduleDay}`}
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="time"
                    aria-label={`Window ${index + 1} start time for ${staffName}`}
                    value={row.start_time}
                    onChange={(event) =>
                      updateRow(row.id, { start_time: event.target.value })
                    }
                    required
                    className={`${styles.input} ${styles.scheduleTime}`}
                  />

                  <input
                    type="time"
                    aria-label={`Window ${index + 1} end time for ${staffName}`}
                    value={row.end_time}
                    onChange={(event) =>
                      updateRow(row.id, { end_time: event.target.value })
                    }
                    required
                    className={`${styles.input} ${styles.scheduleTime}`}
                  />

                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove window ${index + 1} for ${staffName}`}
                    className={`${styles.dangerButton} ${styles.scheduleRemove}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.itemSubmeta}>
              No shifts set. Add a window or apply a Mon–Fri schedule before saving.
            </p>
          )}

          <ActionFeedback state={state} />

          <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
            {pending ? "Saving..." : "Save weekly hours"}
          </button>
        </form>
      </div>
    </details>
  );
}

export function AddStaffForm({
  businessId,
  services,
}: {
  businessId: string;
  services: ServiceOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, actionPending] = useActionState(
    createStaffAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (!state.error && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <section className={styles.activeEditorCard} aria-labelledby="add-staff-heading">
      <h3 id="add-staff-heading" className={styles.subsectionTitle}>
        Add staff member
      </h3>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => {
            formAction(formData);
          });
        }}
        className={styles.formStack}
      >
        <input type="hidden" name="businessId" value={businessId} />
        <div className={styles.fieldGroup}>
          <label htmlFor="new-staff-name" className={styles.label}>
            Display name
          </label>
          <input
            id="new-staff-name"
            name="displayName"
            type="text"
            required
            maxLength={60}
            placeholder="Sam"
            className={styles.input}
          />
        </div>

        {services.length > 0 ? (
          <fieldset className={styles.checkboxFieldset}>
            <legend className={styles.checkboxLegend}>Services they perform</legend>
            <div className={styles.checkboxGrid}>
              {services.map((service) => (
                <label key={service.id} className={styles.checkboxPill}>
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={service.id}
                    defaultChecked={service.is_active}
                    className={styles.checkboxInput}
                  />
                  <span>{service.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <ActionFeedback state={state} />

        <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
          {pending ? "Adding..." : "Add staff member"}
        </button>
      </form>
    </section>
  );
}

export function AddTimeOffForm({
  businessId,
  timezone,
  staff,
  fixedStaffId,
  fixedStaffName,
}: {
  businessId: string;
  timezone: string;
  staff: StaffOption[];
  fixedStaffId?: string;
  fixedStaffName?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, actionPending] = useActionState(
    createTimeOffAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (!state.error && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <section className={styles.activeEditorCard} aria-labelledby="add-timeoff-heading">
      <h3 id="add-timeoff-heading" className={styles.subsectionTitle}>
        Add time off
      </h3>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => {
            formAction(formData);
          });
        }}
        className={styles.formStack}
      >
        <input type="hidden" name="businessId" value={businessId} />

        {fixedStaffId ? (
          <>
            <input type="hidden" name="staffId" value={fixedStaffId} />
            <p className={styles.itemSubmeta}>
              Scheduling time off for {fixedStaffName} in {timezone}.
            </p>
          </>
        ) : (
          <div className={styles.fieldGroup}>
            <label htmlFor="timeoff-staff" className={styles.label}>
              Staff member
            </label>
            <select id="timeoff-staff" name="staffId" required className={styles.select}>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                  {!member.is_active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.formStack}>
          <div className={styles.fieldGroup}>
            <label htmlFor="timeoff-start" className={styles.label}>
              Start ({timezone})
            </label>
            <input
              id="timeoff-start"
              name="startLocal"
              type="datetime-local"
              required
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="timeoff-end" className={styles.label}>
              End ({timezone})
            </label>
            <input
              id="timeoff-end"
              name="endLocal"
              type="datetime-local"
              required
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="timeoff-reason" className={styles.label}>
              Reason (optional)
            </label>
            <input
              id="timeoff-reason"
              name="reason"
              type="text"
              maxLength={200}
              placeholder="Dentist, holiday, or training"
              className={styles.input}
            />
          </div>
        </div>

        <ActionFeedback state={state} />

        <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
          {pending ? "Saving..." : "Add time off"}
        </button>
      </form>
    </section>
  );
}

export function InviteMemberForm({
  businessId,
  unlinkedStaff,
}: {
  businessId: string;
  unlinkedStaff: StaffOption[];
}) {
  const [state, formAction, actionPending] = useActionState(
    createInvitationAction,
    INITIAL_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    emptySubscribe,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );

  const invitePath = state.invitePath ?? null;
  const fullInviteUrl = invitePath ? `${origin}${invitePath}` : null;
  const isCopied = Boolean(invitePath && copiedPath === invitePath);

  async function handleCopy() {
    if (!fullInviteUrl || !invitePath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(fullInviteUrl);
      setCopiedPath(invitePath);
    } catch {
      setCopiedPath(null);
    }
  }

  return (
    <section className={styles.activeEditorCard} aria-labelledby="create-invite-heading">
      <h3 id="create-invite-heading" className={styles.subsectionTitle}>
        Invite a team member
      </h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => {
            formAction(formData);
          });
        }}
        className={styles.formStack}
      >
        <input type="hidden" name="businessId" value={businessId} />
        <div className={styles.formStack}>
          <div className={styles.fieldGroup}>
            <label htmlFor="invite-role" className={styles.label}>
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value === "manager" ? "manager" : "staff")
              }
              className={styles.select}
            >
              <option value="staff">Staff (own time off only)</option>
              <option value="manager">Manager (services &amp; schedules)</option>
            </select>
          </div>

          {role === "staff" ? (
            <div className={styles.fieldGroup}>
              <label htmlFor="invite-staff" className={styles.label}>
                Staff profile (optional)
              </label>
              <select id="invite-staff" name="staffId" className={styles.select}>
                <option value="">Create new staff profile on accept</option>
                {unlinkedStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <ActionFeedback state={state} />

        <button type="submit" disabled={pending} className={styles.workbenchSubmitButton}>
          {pending ? "Creating link..." : "Create invite link"}
        </button>
      </form>

      {invitePath && fullInviteUrl ? (
        <div className={styles.inviteBox}>
          <label htmlFor="generated-invite-link" className={styles.label}>
            Shareable invite link (expires in 7 days)
          </label>
          <div className={styles.inviteRow}>
            <input
              id="generated-invite-link"
              type="text"
              readOnly
              value={fullInviteUrl}
              className={styles.inviteInput}
            />
            <button
              type="button"
              onClick={handleCopy}
              className={styles.secondaryButton}
            >
              {isCopied ? "Copied link" : "Copy link"}
            </button>
            <Link
              href={invitePath}
              prefetch={false}
              className={styles.secondaryLink}
            >
              Open invite
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function StaffIntegrationsEditor({
  businessId,
  staffId,
  staffName,
  telegramLinkedAt,
  icsEnabledAt,
}: {
  businessId: string;
  staffId: string;
  staffName: string;
  telegramLinkedAt: string | null;
  icsEnabledAt: string | null;
}) {
  const [tgCodeState, tgCodeAction, tgCodePending] = useActionState(
    createTelegramLinkCodeAction,
    INITIAL_STATE,
  );
  const [tgUnlinkState, tgUnlinkAction, tgUnlinkPending] = useActionState(
    unlinkStaffTelegramAction,
    INITIAL_STATE,
  );
  const [icsRotateState, icsRotateAction, icsRotatePending] = useActionState(
    rotateStaffIcsTokenAction,
    INITIAL_STATE,
  );
  const [icsRevokeState, icsRevokeAction, icsRevokePending] = useActionState(
    revokeStaffIcsTokenAction,
    INITIAL_STATE,
  );

  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    emptySubscribe,
    getOriginSnapshot,
    getServerOriginSnapshot,
  );

  const telegramCommand = tgCodeState.telegramCommand ?? null;
  const icsPath = icsRotateState.icsPath ?? null;
  const fullIcsUrl = icsPath && origin ? `${origin}${icsPath}` : null;

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => setCopiedValue(null), 2500);
    } catch {
      setCopiedValue(null);
    }
  }

  return (
    <details className={styles.inlineDisclosure}>
      <summary className={styles.disclosureTrigger}>Telegram &amp; calendar (.ics)</summary>
      <div className={styles.disclosureBody}>
        <div className={styles.integrationSection}>
          <div className={styles.integrationHeader}>
            <span className={styles.label}>Telegram notifications</span>
            <p className={styles.itemSubmeta}>
              {telegramLinkedAt
                ? "Telegram alerts are connected for this specialist."
                : "Generate a one-time /start command and send it to the Tendly bot."}
            </p>
          </div>

          <div className={styles.integrationActions}>
            <form action={tgCodeAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="staffId" value={staffId} />
              <button
                type="submit"
                disabled={tgCodePending || tgUnlinkPending}
                className={styles.secondaryButton}
              >
                {tgCodePending
                  ? "Generating..."
                  : telegramLinkedAt
                    ? "New link code"
                    : "Connect Telegram"}
              </button>
            </form>

            {telegramLinkedAt ? (
              <form action={tgUnlinkAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="staffId" value={staffId} />
                <button
                  type="submit"
                  disabled={tgCodePending || tgUnlinkPending}
                  className={styles.dangerButton}
                >
                  {tgUnlinkPending ? "Disconnecting..." : "Disconnect Telegram"}
                </button>
              </form>
            ) : null}
          </div>

          <ActionFeedback state={tgCodeState} />
          <ActionFeedback state={tgUnlinkState} />

          {telegramCommand ? (
            <div className={styles.inviteBox}>
              <label htmlFor={`tg-cmd-${staffId}`} className={styles.label}>
                Bot command (expires in 15 min)
              </label>
              <div className={styles.inviteRow}>
                <input
                  id={`tg-cmd-${staffId}`}
                  type="text"
                  readOnly
                  aria-label={`Telegram start command for ${staffName}`}
                  value={telegramCommand}
                  className={styles.inviteInput}
                />
                <button
                  type="button"
                  onClick={() => copyText(telegramCommand)}
                  className={styles.secondaryButton}
                >
                  {copiedValue === telegramCommand ? "Copied command" : "Copy command"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.integrationSection}>
          <div className={styles.integrationHeader}>
            <span className={styles.label}>Calendar subscription (.ics)</span>
            <p className={styles.itemSubmeta}>
              {icsEnabledAt
                ? "Private .ics feed is active. Rotating replaces the previous URL."
                : "Create a private .ics feed URL for Apple, Google, or Outlook Calendar."}
            </p>
          </div>

          <div className={styles.integrationActions}>
            <form action={icsRotateAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="staffId" value={staffId} />
              <button
                type="submit"
                disabled={icsRotatePending || icsRevokePending}
                className={styles.secondaryButton}
              >
                {icsRotatePending
                  ? "Generating..."
                  : icsEnabledAt
                    ? "Rotate .ics link"
                    : "Enable .ics feed"}
              </button>
            </form>

            {icsEnabledAt ? (
              <form action={icsRevokeAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="staffId" value={staffId} />
                <button
                  type="submit"
                  disabled={icsRotatePending || icsRevokePending}
                  className={styles.dangerButton}
                >
                  {icsRevokePending ? "Revoking..." : "Revoke .ics"}
                </button>
              </form>
            ) : null}
          </div>

          <ActionFeedback state={icsRotateState} />
          <ActionFeedback state={icsRevokeState} />

          {icsEnabledAt && icsPath && fullIcsUrl ? (
            <div className={styles.inviteBox}>
              <label htmlFor={`ics-url-${staffId}`} className={styles.label}>
                Private calendar feed URL
              </label>
              <div className={styles.inviteRow}>
                <input
                  id={`ics-url-${staffId}`}
                  type="text"
                  readOnly
                  aria-label={`Calendar feed URL for ${staffName}`}
                  value={fullIcsUrl}
                  className={styles.inviteInput}
                />
                <button
                  type="button"
                  onClick={() => copyText(fullIcsUrl)}
                  className={styles.secondaryButton}
                >
                  {copiedValue === fullIcsUrl ? "Copied .ics link" : "Copy .ics link"}
                </button>
                <a
                  href={icsPath}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.secondaryLink}
                >
                  Open feed
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function formatBillingDate(iso: string | null, timezone: string): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatPlanStatusLabel(usage: BusinessPlanUsage, timezone: string): string {
  const periodEndLabel = formatBillingDate(usage.currentPeriodEnd, timezone);
  if (usage.planTier === "pro") {
    if (usage.cancelAtPeriodEnd && periodEndLabel) {
      return `Pro active · ends ${periodEndLabel}`;
    }
    if (usage.subscriptionStatus === "trialing") {
      return periodEndLabel ? `Trialing · renews ${periodEndLabel}` : "Trial active";
    }
    return periodEndLabel ? `Active · renews ${periodEndLabel}` : "Active subscription";
  }

  switch (usage.subscriptionStatus) {
    case "past_due":
    case "unpaid":
      return "Past due — update payment method";
    case "canceled":
      return "Canceled — Free limits active";
    case "paused":
      return "Paused — Free limits active";
    default:
      return "Included free tier";
  }
}

export function BillingPlanPanel({
  businessId,
  timezone,
  isOwner,
  planUsage,
  billingNotice,
}: {
  businessId: string;
  timezone: string;
  isOwner: boolean;
  planUsage: BusinessPlanUsage;
  billingNotice: "success" | "cancelled" | null;
}) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    createCheckoutSessionAction,
    INITIAL_STATE,
  );
  const [portalState, portalAction, portalPending] = useActionState(
    createPortalSessionAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    const targetUrl = checkoutState.redirectUrl ?? portalState.redirectUrl;
    if (targetUrl) {
      window.location.assign(targetUrl);
    }
  }, [checkoutState.redirectUrl, portalState.redirectUrl]);

  const isPro = planUsage.planTier === "pro";
  const needsAttention =
    planUsage.subscriptionStatus === "past_due" ||
    planUsage.subscriptionStatus === "unpaid";

  return (
    <div className={styles.restPanel}>
      <div className={styles.billingPanelBody}>
        {billingNotice === "success" ? (
          <p className={styles.alertSuccess} role="status">
            Checkout completed — your plan updates automatically once Stripe confirms the
            payment webhook.
          </p>
        ) : null}

        {billingNotice === "cancelled" ? (
          <p className={styles.billingNotice} role="status">
            Checkout was cancelled. Your shop remains on the{" "}
            {isPro ? "Pro" : "Free"} plan.
          </p>
        ) : null}

        <div className={styles.billingHeaderRow}>
          <div className={styles.billingTitleGroup}>
            <span
              className={`${styles.billingBadge} ${
                isPro
                  ? styles.billingBadgePro
                  : needsAttention
                    ? styles.billingBadgeWarn
                    : ""
              }`}
            >
              {isPro ? "Pro plan — $19/mo" : "Free plan — $0/mo"}
            </span>
            <p className={styles.billingStatusText}>
              {formatPlanStatusLabel(planUsage, timezone)}
            </p>
          </div>
        </div>

        <dl className={styles.billingQuotaGrid}>
          <div className={styles.billingQuotaCard}>
            <dt className={styles.billingQuotaLabel}>Active staff</dt>
            <dd className={styles.billingQuotaValue}>
              {planUsage.activeStaffCount} / {planUsage.maxStaff}
            </dd>
          </div>
          <div className={styles.billingQuotaCard}>
            <dt className={styles.billingQuotaLabel}>Active services</dt>
            <dd className={styles.billingQuotaValue}>
              {planUsage.activeServicesCount} /{" "}
              {planUsage.maxServices === null ? "Unlimited" : planUsage.maxServices}
            </dd>
          </div>
          <div className={styles.billingQuotaCard}>
            <dt className={styles.billingQuotaLabel}>Bookings this month</dt>
            <dd className={styles.billingQuotaValue}>
              {planUsage.monthlyBookingsCount} /{" "}
              {planUsage.maxMonthlyBookings === null
                ? "Unlimited"
                : planUsage.maxMonthlyBookings}
            </dd>
          </div>
        </dl>

        {isOwner ? (
          <div className={styles.billingActionsRow}>
            {!isPro ? (
              <form action={checkoutAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <button
                  type="submit"
                  disabled={checkoutPending || portalPending}
                  className={styles.billingPrimaryButton}
                >
                  {checkoutPending ? "Opening Checkout..." : "Upgrade to Pro — $19/mo"}
                </button>
              </form>
            ) : null}

            {planUsage.hasStripeCustomer ? (
              <form action={portalAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <button
                  type="submit"
                  disabled={checkoutPending || portalPending}
                  className={styles.secondaryButton}
                >
                  {portalPending ? "Opening portal..." : "Manage billing"}
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className={styles.billingNote}>
            Only the shop owner can change the subscription or open the Stripe billing
            portal.
          </p>
        )}

        <ActionFeedback state={checkoutState} />
        <ActionFeedback state={portalState} />
      </div>
    </div>
  );
}
