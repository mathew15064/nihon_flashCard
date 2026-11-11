import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { listVocabulary } from "@/modules/vocabulary/service";

export default async function AdminOverview() {
  if (!(await isAdmin())) redirect("/admin/login");
  const { items } = listVocabulary({includeDrafts:true,limit:100});
  const drafts = items.filter((item) => item.status === "draft").length;
  const published = items.filter((item) => item.status === "published").length;
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon Admin</span>
      <h1>Quản lý nội dung</h1>
      <p className="page-intro">Kiểm duyệt và tổ chức kho từ vựng Nhật – Việt.</p>
      <div className="admin-grid">
        <Link className="admin-panel" href="/admin/vocabulary">
          <div className="muted">Từ vựng đang chờ duyệt (trong 100 bản ghi đầu)</div>
          <strong className="admin-stat">{drafts}</strong>
          <p>Duyệt và xuất bản →</p>
        </Link>
        <Link className="admin-panel" href="/admin/decks">
          <div className="muted">Từ vựng đã xuất bản (trong 100 bản ghi đầu)</div>
          <strong className="admin-stat">{published}</strong>
          <p>Quản lý bộ từ →</p>
        </Link>
      </div>
    </section>
  );
}
