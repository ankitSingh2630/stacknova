"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminIcon from "./AdminIcon";
import styles from "@/app/admin/admin.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [help, setHelp] = useState(false);
  return <div className={styles.loginPage}>
    <header className={styles.loginHeader}><div className={styles.navInner}>
      <Link href="/" className={styles.brand}><span className={styles.brandMark}><AdminIcon name="code" size={22} /></span><span><span className={styles.brandName}>StackNova</span><span className={styles.brandSub}>Ops Core · UI Demo</span></span></Link>
      <Link href="/admin/" className={styles.iconButton} aria-label="Open admin demo"><AdminIcon name="menu" /></Link>
    </div></header>
    <main className={styles.loginMain}>
      <span className={styles.loginEyebrow}><span className={styles.dot} />Lead Ops · Admin Portal</span>
      <h1 className={styles.loginTitle}>Admin Login</h1>
      <p className={styles.loginIntro}>Enter your administrator details to preview the lead pipeline and enquiry management console.</p>
      <form className={styles.loginCard} onSubmit={event => { event.preventDefault(); router.push("/admin/"); }}>
        <div className={styles.loginCardTop}><span><AdminIcon name="shield" size={16} />DEMO GATEWAY</span><small>PHASE 1 · UI ONLY</small></div>
        <div className={styles.loginField}>
          <div className={styles.labelRow}><label htmlFor="admin-email">Email Address</label><span className={styles.workTag}>WORK ACCOUNT</span></div>
          <div className={styles.loginInputWrap}><AdminIcon name="user" /><input id="admin-email" type="email" name="email" autoComplete="off" className={styles.loginInput} defaultValue="admin@stacknova.io" required aria-describedby="login-demo-disclaimer" /></div>
        </div>
        <div className={styles.loginField}>
          <div className={styles.labelRow}><label htmlFor="admin-password">Password</label><button type="button" className={styles.textLink} onClick={() => setHelp(value => !value)} aria-expanded={help} aria-controls="login-help">Forgot password?</button></div>
          <div className={styles.loginInputWrap}><AdminIcon name="lock" /><input id="admin-password" type={visible ? "text" : "password"} name="password" autoComplete="off" className={styles.loginInput} defaultValue="demo-preview-only" required aria-describedby="login-demo-disclaimer" /><button type="button" className={styles.iconButton} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(value => !value)}><AdminIcon name="eye" /></button></div>
          {help && <p id="login-help" className={styles.feedback}>This is a UI demo. Any valid email and nonempty password opens the preview; password recovery is unavailable.</p>}
        </div>
        <div className={styles.remember}><label><input type="checkbox" defaultChecked />Remember session</label><span>Demo only</span></div>
        <button type="submit" className={styles.primaryButton + " " + styles.loginSubmit}>Sign In to Admin<AdminIcon name="arrow" /></button>
        <div className={styles.loginFoot}><span><AdminIcon name="lock" size={14} />Authentication: Demo</span><span>ID: SN-DEMO-01</span></div>
      </form>
      <div className={styles.loginSignals}><span><span className={styles.dot} />Lead Intake Preview</span><span><AdminIcon name="bolt" size={14} />Mock data ready</span></div>
      <p id="login-demo-disclaimer" className={styles.loginDisclaimer}><AdminIcon name="shield" size={18} /><span>Phase 1 preview · No authentication. Use demo details only. Credentials are never saved or sent.</span></p>
    </main>
  </div>;
}
