"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AdminIcon from "./AdminIcon";
import styles from "@/app/admin/admin.module.css";
import { useAdminAuth } from "./AdminAuthProvider";

export default function AdminNavbar() {
  const pathname = usePathname();
  const { state, logout, loggingOut, logoutError } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isLead = pathname.startsWith("/admin/lead/") || pathname === "/admin/lead";
  const isLeads = !isLead && pathname.startsWith("/admin/leads");
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } };
    const onPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !toggleRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open]);
  const links = <>
    <Link href="/admin/" className={styles.navLink} aria-current={!isLeads && !isLead ? "page" : undefined} onClick={() => setOpen(false)}>Dashboard</Link>
    <Link href="/admin/leads/" className={styles.navLink} aria-current={isLeads || isLead ? "page" : undefined} onClick={() => setOpen(false)}>Leads</Link>
    <button type="button" className={styles.navLink + " " + styles.logoutButton} disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? "Signing out…" : "Logout"}</button>
  </>;
  return <>
    <header className={styles.navbar}>
      <div className={styles.navInner}>
        <Link href="/admin/" className={styles.brand} aria-label="StackNova admin dashboard">
          {/* Same deployed artwork and sizing as the public Navbar; master: brand/t_logo-master.png. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="StackNova Technologies logo" className="h-14 w-auto sm:h-22" width={120} height={40} decoding="async" />
        </Link>
        <nav className={styles.topLinks} aria-label="Admin navigation">{links}</nav>
        <span className={styles.avatar} aria-label={state.status === "authorized" ? `Signed in as ${state.user.name || state.user.email}` : "Administrator"}>SN</span>
        <button ref={toggleRef} className={styles.iconButton + " " + styles.menuButton} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="admin-mobile-menu" onClick={() => setOpen(value => !value)}><AdminIcon name={open ? "close" : "menu"} /></button>
      </div>
      {open && <div ref={menuRef} id="admin-mobile-menu" className={styles.mobileMenu}><nav aria-label="Mobile admin navigation">{links}</nav></div>}
    </header>
    {logoutError && <p className={styles.logoutError} role="alert" aria-live="polite">{logoutError}</p>}
  </>;
}
