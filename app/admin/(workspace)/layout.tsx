import AdminNavbar from "@/components/admin/AdminNavbar";
import MockLeadsProvider from "@/components/admin/MockLeadsProvider";
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <MockLeadsProvider><AdminNavbar />{children}</MockLeadsProvider>;
}
