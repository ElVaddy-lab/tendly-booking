"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { TurnstileField } from "@/components/turnstile-field";

import { signInAction, signUpAction, type AuthActionState } from "./actions";
import styles from "./auth.module.css";

const initialState: AuthActionState = { error: null };

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const action = isSignUp ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const passwordHintId = `${uid}-password-hint`;

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <Link href={isSignUp ? "/sign-in" : "/sign-up"} className={styles.navLink}>
            {isSignUp ? "Sign in" : "Start free"}
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby={`${uid}-title`}>
          <div className={styles.cardHead}>
            <h1 id={`${uid}-title`} className={styles.title}>
              {isSignUp ? "Start your booking page" : "Sign in"}
            </h1>
            <span className={styles.demoTag}>Portfolio demo</span>
          </div>

          <form action={formAction} className={styles.form} noValidate={false}>
            <p className={styles.lead}>
              {isSignUp
                ? "Create a shop owner account, pick your public URL, and add your first service."
                : "Sign in to manage your schedule, services, and bookings."}
            </p>

            <div className={styles.field}>
              <label htmlFor={emailId} className={styles.label}>
                Email
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                required
                className={styles.input}
                placeholder="you@northsidebarbers.test"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={passwordId} className={styles.label}>
                Password
              </label>
              <input
                id={passwordId}
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={isSignUp ? 8 : 6}
                maxLength={72}
                aria-describedby={isSignUp ? passwordHintId : undefined}
                className={styles.input}
              />
              {isSignUp && (
                <p id={passwordHintId} className={styles.hint}>
                  At least 8 characters.
                </p>
              )}
            </div>

            <TurnstileField />

            {state.error && (
              <p className={styles.error} role="alert" aria-live="polite">
                {state.error}
              </p>
            )}

            <button type="submit" disabled={pending} className={styles.submit}>
              {pending
                ? isSignUp
                  ? "Creating account…"
                  : "Signing in…"
                : isSignUp
                  ? "Create account"
                  : "Sign in"}
            </button>

            {isSignUp && (
              <p className={styles.demoNote}>
                Open demo sign-up: no email confirmation is required. Visitor accounts and
                businesses are removed after 24 hours.
              </p>
            )}
          </form>
        </section>

        <p className={styles.footerLink}>
          {isSignUp ? (
            <>
              Already have an account? <Link href="/sign-in">Sign in</Link>
            </>
          ) : (
            <>
              Setting up a new shop? <Link href="/sign-up">Start free</Link>
            </>
          )}
        </p>
      </main>
    </div>
  );
}
