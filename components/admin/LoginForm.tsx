"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "./AdminAuthProvider";
import { authMessages } from "@/lib/admin/auth";
import AdminIcon from "./AdminIcon";
import styles from "@/app/admin/admin.module.css";

export default function LoginForm() {
  const router = useRouter();
  const { state, login, refresh } = useAdminAuth();
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    if (state.status === "authorized") router.replace("/admin/");
  }, [state.status, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || state.status === "loading") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    if (!email || !password) {
      setValidation("Please enter your email and password.");
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setValidation("");
    try { await login(email, password); }
    finally {
      // Keep passwords only in the form for submission, then clear the field.
      const input = form.elements.namedItem("password");
      if (input instanceof HTMLInputElement) input.value = "";
      pending.current = false;
      setSubmitting(false);
    }
  };
  const waiting = state.status === "loading" || state.status === "authorized";
  const message = validation || (state.status === "forbidden" ? authMessages.forbidden
    : state.status === "signedOut" || state.status === "error" ? state.message : "");
  return <div className={styles.loginPage}>
    <header className={styles.loginHeader}><div className={styles.navInner}>
      <Link href="/" className={styles.brand}><span className={styles.brandMark}><AdminIcon name="code" size={22} /></span><span><span className={styles.brandName}>StackNova</span><span className={styles.brandSub}>Ops Core · Admin Portal</span></span></Link>
    </div></header>
    <main className={styles.loginMain}>
      <span className={styles.loginEyebrow}><span className={styles.dot} />Lead Ops · Admin Portal</span>
      <h1 className={styles.loginTitle}>Admin Login</h1>
      <p className={styles.loginIntro}>Sign in with your authorized administrator account to access the lead workspace.</p>
      {waiting && !submitting ? <p role="status" className={styles.authState}>{state.status === "authorized" ? "Opening admin workspace…" : "Checking admin session…"}</p> : <>
        <form className={styles.loginCard} onSubmit={onSubmit} aria-busy={submitting}>
          <div className={styles.loginCardTop}><span><AdminIcon name="shield" size={16} />ADMIN ACCESS</span><small>STACKNOVA</small></div>
          <div className={styles.loginField}>
            <div className={styles.labelRow}><label htmlFor="admin-email">Email Address</label><span className={styles.workTag}>WORK ACCOUNT</span></div>
            <div className={styles.loginInputWrap}><AdminIcon name="user" /><input id="admin-email" type="email" name="email" autoComplete="email" className={styles.loginInput} required disabled={submitting} aria-describedby={message ? "login-error" : undefined} onChange={() => setValidation("")} /></div>
          </div>
          <div className={styles.loginField}>
            <div className={styles.labelRow}><label htmlFor="admin-password">Password</label></div>
            <div className={styles.loginInputWrap}><AdminIcon name="lock" /><input id="admin-password" type={visible ? "text" : "password"} name="password" autoComplete="current-password" className={styles.loginInput} required disabled={submitting} aria-describedby={message ? "login-error" : undefined} onChange={() => setValidation("")} /><button type="button" className={styles.iconButton} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={submitting} onClick={() => setVisible(value => !value)}><AdminIcon name="eye" /></button></div>
          </div>
          {message && <p id="login-error" className={styles.authError} role="alert" aria-live="polite">{message}</p>}
          <button type="submit" className={styles.primaryButton + " " + styles.loginSubmit} disabled={submitting}>{submitting ? "Signing in…" : <>Sign In to Admin<AdminIcon name="arrow" /></>}</button>
          <div className={styles.loginFoot}><span><AdminIcon name="lock" size={14} />Secure sign-in</span><span>Authorized admins only</span></div>
        </form>
        {state.status === "error" && <button className={styles.textLink + " " + styles.authRetry} onClick={() => void refresh()}>Check session again</button>}
      </>}
      <div className={styles.loginSignals}><span><AdminIcon name="bolt" size={14} />Mock lead workspace</span></div>
    </main>
  </div>;
}
