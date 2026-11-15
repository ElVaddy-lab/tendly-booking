"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import {
  createInvitationAction,
  createServiceAction,
  createStaffAction,
  createTimeOffAction,
  deleteServiceAction,
  deleteTimeOffAction,
  revokeInvitationAction,
  toggleServiceActiveAction,
  toggleStaffActiveAction,
  updateServiceStaffAction,
  updateStaffScheduleAction,
  type DashboardActionState,
} from "./actions";
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
