import type { Metadata } from "next";
import styles from "./admin.module.css";
import AdminAuthProvider from "@/components/admin/AdminAuthProvider";

export const metadata: Metadata = { title: "Admin", description: "StackNova administrator lead workspace.", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.admin}><AdminAuthProvider>{children}</AdminAuthProvider></div>;
}
