"use client";

import styles from "@/app/admin/admin.module.css";

export default function LeadsState({ loading, error, onRetry }: {
  loading: boolean; error: string; onRetry: () => Promise<void>;
}) {
  return <div className={styles.empty}>
    {loading ? <p role="status">Loading leads…</p> : error ? <>
      <p role="alert">{error}</p><button className={styles.secondaryButton} onClick={() => void onRetry()}>Try again</button>
    </> : <p>No leads found.</p>}
  </div>;
}
