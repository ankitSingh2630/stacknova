"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AdminIcon from "./AdminIcon";
import styles from "@/app/admin/admin.module.css";

export default function AdminNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isLead = pathname.startsWith("/admin/lead/") || pathname === "/admin/lead";
  const isLeads = !isLead && pathname.startsWith("/admin/leads");
  const label = isLead ? "Lead Details" : isLeads ? "Leads List" : "Dashboard";
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
    <Link href="/admin/" className={styles.navLink} aria-current={!isLeads && !isLead ? "page" : undefined} onClick={() => setOpen(false)}><AdminIcon name="grid" />Dashboard</Link>
    <Link href="/admin/leads/" className={styles.navLink} aria-current={isLeads || isLead ? "page" : undefined} onClick={() => setOpen(false)}><AdminIcon name="leads" />Leads</Link>
    <Link href="/admin/login/" className={styles.navLink} onClick={() => setOpen(false)}><AdminIcon name="logout" />Logout</Link>
  </>;
  return <>
    <header className={styles.navbar}>
      <div className={styles.navInner}>
        {isLead && <Link href="/admin/leads/" aria-label="Back to leads"><AdminIcon name="back" /></Link>}
        <Link href="/admin/" className={styles.brand} aria-label="StackNova admin dashboard"><span className={styles.brandMark}><AdminIcon name="code" size={22} /></span><span><span className={styles.brandName}>{isLead ? "Lead Details" : "StackNova"}</span>{!isLead && <span className={styles.brandSub}>{label}</span>}</span></Link>
        <nav className={styles.topLinks} aria-label="Admin navigation">{links}</nav>
        <span className={styles.avatar} aria-label="Demo administrator">SN</span>
        <button ref={toggleRef} className={styles.iconButton + " " + styles.menuButton} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="admin-mobile-menu" onClick={() => setOpen(value => !value)}><AdminIcon name={open ? "close" : "menu"} /></button>
      </div>
      {open && <div ref={menuRef} id="admin-mobile-menu" className={styles.mobileMenu}><nav aria-label="Mobile admin navigation">{links}</nav></div>}
    </header>
    {!isLeads && !isLead && <nav className={styles.bottomNav} aria-label="Admin quick navigation">{links}</nav>}
  </>;
}
