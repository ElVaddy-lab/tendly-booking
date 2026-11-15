"use client";

import { useActionState, useId } from "react";

import type { Enums } from "@/types/database.generated";

import { acceptInvitationAction, type AcceptInviteState } from "./actions";
import styles from "./invite.module.css";

const INITIAL_STATE: AcceptInviteState = { error: null };

export function InviteAcceptForm({
  token,
  businessName,
  role,
  staffName,
  needsDisplayName,
}: {
  token: string;
  businessName: string;
  role: Enums<"member_role">;
  staffName: string | null;
  needsDisplayName: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    INITIAL_STATE,
  );
  const nameInputId = useId();

  return (
    <form action={formAction} className={styles.formBody}>
      <input type="hidden" name="token" value={token} />

      {staffName ? (
        <p className={styles.lead}>
          Accepting will link your account to <strong>{staffName}</strong> at{" "}
          <strong>{businessName}</strong> ({role}).
        </p>
      ) : null}

      {needsDisplayName ? (
        <div className={styles.field}>
          <label htmlFor={nameInputId} className={styles.label}>
            Display name on booking schedule <span aria-hidden="true">*</span>
          </label>
          <input
            id={nameInputId}
            name="displayName"
            type="text"
            required
            maxLength={60}
            placeholder="Marta Koval"
            className={styles.input}
          />
        </div>
      ) : null}

      {state.error ? (
        <p className={styles.error} role="alert" aria-live="polite">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={styles.submit}>
        {pending ? "Joining shop…" : "Accept invitation"}
      </button>
    </form>
  );
}
