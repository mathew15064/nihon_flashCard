import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { listVocabulary } from "@/modules/vocabulary/service";
import { publishVocabularyAction, createVocabularyAction } from "./actions";

export default async function AdminVocabularyPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const { items } = listVocabulary({ includeDrafts: true, limit: 100 });
  const drafts = items.filter(item => item.status === "draft");
  const published = items.filter(item => item.status === "published");
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon Admin · Editorial</span>
      <h1>Kiểm duyệt từ vựng</h1>
      <p className="page-intro">Từ được nhập hoặc do AI/MCP bổ sung luôn bắt đầu ở dạng nháp. Hãy xác minh nghĩa và cách đọc trước khi xuất bản.</p>
      <div className="admin-panel">
        <h2>Thêm từ vựng mới</h2>
        <form action={createVocabularyAction} className="admin-form form-grid">
          <label>Từ tiếng Nhật<input name="word" required maxLength={120} placeholder="例: 食べる" /></label>
          <label>Cách đọc<input name="reading" required maxLength={120} placeholder="例: たべる" /></label>
          <label>Nghĩa tiếng Việt<input name="meaningVi" required maxLength={500} placeholder="例: ăn" /></label>
          <label>JLPT<select name="jlptLevel"><option value="">Chưa xác định</option>
            {["N5","N4","N3","N2","N1"].map(x=><option key={x}>{x}</option>)}</select></label>
          <button className="button primary" type="submit">Lưu bản nháp</button>
        </form>
      </div>
      <div className="admin-panel">
        <h2>Chờ duyệt ({drafts.length})</h2>
        {drafts.length === 0 ? <p className="muted">Không có từ đang chờ trong trang dữ liệu này.</p> :
          <div className="review-list">{drafts.map(item=>
            <article key={item.id} className="review-row">
              <div className="review-description"><strong>{item.word}</strong> <span className="muted">{item.reading} · {item.jlptLevel ?? "Chưa phân loại"}</span>
                <p>{item.senses.filter(s=>s.language==="vi").map(s=>s.meaning).join("; ") || "Chưa có nghĩa tiếng Việt"}</p>
                <small className="muted">Nguồn: {item.source}</small>
              </div>
              <form action={publishVocabularyAction}>
                <input type="hidden" name="id" value={item.id}/>
                <button type="submit" className="button primary" title="Đã kiểm tra nghĩa và cách đọc">Xuất bản</button>
              </form>
            </article>
          )}</div>}
      </div>
      <div className="admin-panel">
        <h2>Đã xuất bản ({published.length})</h2>
        <div className="review-list">{published.map(item=>
          <div className="review-row" key={item.id}>
            <strong>{item.word}</strong><span className="muted">{item.reading}</span><span className="level-badge">{item.jlptLevel ?? "—"}</span>
          </div>
        )}</div>
      </div>
      <p className="muted">Đang hiển thị tối đa 100 bản ghi đầu tiên. Tìm kiếm và phân trang nâng cao sẽ được bổ sung sau.</p>
    </section>
  );
}
