import Link from "next/link";
import { isAdmin } from "@/auth";
import { logoutAdmin } from "./actions";

// Never prerender Admin pages with build-time environment/session state.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isSignedIn = await isAdmin();
  return (
    <>
      {isSignedIn && (
        <nav className="admin-nav" aria-label="Quản trị">
          <Link href="/admin">Tổng quan</Link>
          <Link href="/admin/vocabulary">Duyệt từ vựng</Link>
          <Link href="/admin/decks">Quản lý bộ từ</Link>
          <Link href="/admin/ai-studio">AI Studio</Link>
          <form action={logoutAdmin}><button type="submit">Đăng xuất</button></form>
        </nav>
      )}
      {children}
    </>
  );
}
