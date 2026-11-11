import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nihon — Japanese Vocabulary",
  description: "Học từ vựng tiếng Nhật và ôn tập thông minh",
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="vi">
      <body>
        <header className="site-header">
          <Link href="/" className="brand"><span className="brand-mark">日</span><span>Nihon <span className="brand-sub">Vocabulary</span></span></Link>
          <nav className="site-nav" aria-label="Điều hướng">
            <Link href="/vocabulary">Kho từ vựng</Link>
            <Link href="/practice">Luyện tập</Link>
            <Link href="/decks">Bộ từ</Link>
            <Link href="/admin">Admin</Link>
          </nav>
          <span className="header-tag">v2 · Preview</span>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">Nihon v2 · Next.js Monolith · Chưa kết nối dữ liệu người học cũ</footer>
      </body>
    </html>
  );
}
