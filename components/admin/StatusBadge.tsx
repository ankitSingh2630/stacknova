import type { LeadStatus } from "@/lib/admin/types";
import styles from "@/app/admin/admin.module.css";
const colors: Record<LeadStatus, string> = { New: "new", Contacted: "contacted", "In Progress": "progress", Converted: "converted", Closed: "closed" };
export default function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={styles.badge} data-status={colors[status]}><span className={styles.dot} />{status}</span>;
}
