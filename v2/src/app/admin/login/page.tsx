import { isAdmin } from "@/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <section className="content-page admin-login">
      <span className="eyebrow">Nihon Admin · Nội bộ</span>
      <h1>Đăng nhập quản trị</h1>
      <p className="page-intro">Duyệt từ vựng và quản lý bộ từ trước khi xuất bản.</p>
      {!process.env.AUTH_SECRET || !process.env.NIHON_ADMIN_PASSWORD_HASH
        ? <div className="notice" role="alert">Admin chưa được cấu hình. Hãy xem hướng dẫn trong v2/README.md để thiết lập AUTH_SECRET và mật khẩu đã băm trên server.</div>
        : <LoginForm />}
    </section>
  );
}
