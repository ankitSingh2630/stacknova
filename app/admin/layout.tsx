import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import styles from "./admin.module.css";
import AdminAuthProvider from "@/components/admin/AdminAuthProvider";

const inter = Inter({ subsets: ["latin"], variable: "--admin-body-font", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--admin-heading-font", display: "swap" });
export const metadata: Metadata = { title: "Admin", description: "StackNova administrator lead workspace.", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable + " " + jakarta.variable + " " + styles.admin}><AdminAuthProvider>{children}</AdminAuthProvider></div>;
}
