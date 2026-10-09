"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "./AdminAuthProvider";
import { authMessages } from "@/lib/admin/auth";
import styles from "@/app/admin/admin.module.css";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useAdminAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "signedOut") router.replace("/admin/login/");
  }, [state.status, router]);
  if (state.status === "authorized") return <>{children}</>;
  if (state.status === "forbidden") return <main className={styles.authState}><p role="alert">{authMessages.forbidden}</p><Link className={styles.textLink} href="/admin/login/">Back to sign in</Link></main>;
  if (state.status === "error") return <main className={styles.authState}><p role="alert">{state.message}</p><button className={styles.secondaryButton} onClick={() => void refresh()}>Try again</button></main>;
  return <main className={styles.authState}><p role="status">{state.status === "loading" ? "Checking admin session…" : "Redirecting to sign in…"}</p></main>;
}
