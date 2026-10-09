import AdminNavbar from "@/components/admin/AdminNavbar";
import LeadsProvider from "@/components/admin/LeadsProvider";
import AdminGuard from "@/components/admin/AdminGuard";
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard><LeadsProvider><AdminNavbar />{children}</LeadsProvider></AdminGuard>;
}
