"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { TurnstileField } from "@/components/turnstile-field";

import { signInAction, signUpAction, type AuthActionState } from "./actions";
import styles from "./auth.module.css";

const initialState: AuthActionState = { error: null };

export function AuthForm({
  mode,
  nextPath = null,
}: {
  mode: "sign-in" | "sign-up";
  nextPath?: string | null;
}) {
  const isSignUp = mode === "sign-up";
  const action = isSignUp ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [email, setEmail] = useState("");
  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const passwordHintId = `${uid}-password-hint`;
  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft className={styles.backIcon} aria-hidden="true" strokeWidth={1.5} />
            Back to landing
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.spread}>
          <aside className={styles.spreadLeft} aria-label="About Tendly demo">
            <div className={styles.spreadTop}>
              <span className={styles.demoTag}>Portfolio demo</span>
              <span className={styles.shopLabel}>Northside Barbers</span>
            </div>

            <div className={styles.editorialBlock}>
              <p className={styles.editorialHeadline}>
                <span className={styles.headlineLine}>Keep every</span>{" "}
                <span className={`${styles.headlineLine} ${styles.headlinePair}`}>
                  morning <span className={styles.timeChip}>09:00</span>
                </span>{" "}
                <span className={styles.headlineLine}>calm.</span>
              </p>
              <p className={styles.editorialCopy}>
                The calm booking system for independent barbers and stylists.
              </p>
            </div>

            <div className={styles.resetBox}>
              <p>Demo data resets every 24 hours. No password reset emails are sent.</p>
            </div>
          </aside>

          <section className={styles.card} aria-labelledby={`${uid}-title`}>
            <div className={styles.cardHead}>
              <h1 id={`${uid}-title`} className={styles.title}>
                {isSignUp ? "Start your booking page" : "Sign in"}
              </h1>
              <p className={styles.lead}>
                {nextPath
                  ? isSignUp
                    ? "Create an account to accept your shop invitation."
                    : "Sign in to accept your shop invitation."
                  : isSignUp
                    ? "Create a shop owner account, pick your public URL, and add your first service."
                    : "Enter your shop credentials to manage your schedule, services, and bookings."}
              </p>
            </div>

            <form action={formAction} className={styles.form} noValidate={false}>
              {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

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
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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

              <p className={styles.footerLink}>
                {isSignUp ? (
                  <>
                    Already have an account?{" "}
                    <Link href={`/sign-in${nextQuery}`}>Sign in</Link>
                  </>
                ) : (
                  <>
                    Setting up a new shop?{" "}
                    <Link href={`/sign-up${nextQuery}`}>Start free</Link>
                  </>
                )}
              </p>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export function AuthFallback({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";

  return (
    <div className={styles.page}>
      <header>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/" className={styles.wordmark}>
            Tendly
          </Link>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft className={styles.backIcon} aria-hidden="true" strokeWidth={1.5} />
            Back to landing
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.spread}>
          <aside className={styles.spreadLeft} aria-label="About Tendly demo">
            <div className={styles.spreadTop}>
              <span className={styles.demoTag}>Portfolio demo</span>
              <span className={styles.shopLabel}>Northside Barbers</span>
            </div>

            <div className={styles.editorialBlock}>
              <p className={styles.editorialHeadline}>
                <span className={styles.headlineLine}>Keep every</span>{" "}
                <span className={`${styles.headlineLine} ${styles.headlinePair}`}>
                  morning <span className={styles.timeChip}>09:00</span>
                </span>{" "}
                <span className={styles.headlineLine}>calm.</span>
              </p>
              <p className={styles.editorialCopy}>
                The calm booking system for independent barbers and stylists.
              </p>
            </div>

            <div className={styles.resetBox}>
              <p>Demo data resets every 24 hours. No password reset emails are sent.</p>
            </div>
          </aside>

          <section className={styles.card} aria-busy="true">
            <div className={styles.cardHead}>
              <h1 className={styles.title}>
                {isSignUp ? "Start your booking page" : "Sign in"}
              </h1>
              <p className={styles.lead}>Preparing form…</p>
            </div>

            <div className={styles.form} aria-hidden="true">
              <div className={styles.field}>
                <span className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
                <span className={styles.skeletonInput} />
              </div>
              <div className={styles.field}>
                <span className={`${styles.skeletonLine} ${styles.skeletonLabel}`} />
                <span className={styles.skeletonInput} />
              </div>
              <span className={styles.skeletonSubmit} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
