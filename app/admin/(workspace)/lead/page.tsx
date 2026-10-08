import { Suspense } from "react";
import LeadDetails from "@/components/admin/LeadDetails";
import styles from "@/app/admin/admin.module.css";
export const metadata = { title: "Admin Lead Details" };
// Keep URL query reading below Suspense so this route exports one static HTML page.
export default function LeadPage() {
  return <Suspense fallback={<main className={styles.page}><p role="status">Loading lead details…</p></main>}><LeadDetails /></Suspense>;
}
