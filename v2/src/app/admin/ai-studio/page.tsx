import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { configuredModel, isProviderConfigured } from "@/modules/ai/provider";
import { generationQuota, listGenerationJobs, remainingGenerationQuota } from "@/modules/ai/service";
import { startGenerationAction } from "./actions";

export default async function AIStudioPage({
  searchParams,
}: { searchParams: Promise<{error?:string}> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { error } = await searchParams;
  const configured = isProviderConfigured();
  const jobs = listGenerationJobs();
  const remaining = remainingGenerationQuota();
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon Admin · AI</span>
      <h1>AI Vocabulary Studio</h1>
      <p className="page-intro">
        Tạo từ vựng tiếng Nhật theo chủ đề bằng OpenAI Responses API.
        Nội dung luôn vào danh sách đề xuất, không tự động xuất bản.
      </p>
      <div className="ai-status">
        <div><strong>Provider: OpenAI</strong><p className="muted">Model: {configuredModel()}</p></div>
        <span className="level-badge">{configured ? "Đã cấu hình API key ở server" : "Chưa cấu hình API key"}</span>
      </div>
      <p className="muted">Giới hạn: tối đa 20 từ/lần · {generationQuota()} lần generate/24 giờ · còn khoảng {remaining} lượt theo lịch sử gần nhất.</p>
      {!configured && <div className="notice" role="status">
        Chưa có <code>OPENAI_API_KEY</code> trên server. Xem <code>v2/.env.example</code> để cấu hình;
        không nhập hoặc lưu API key trong trình duyệt.
      </div>}
      {error && <p className="notice form-error" role="alert">Không thể tạo danh sách: {error}</p>}
      <div className="admin-panel">
        <h2>Tạo bộ từ vựng mới</h2>
        <form action={startGenerationAction} className="admin-form form-grid">
          <label>Chủ đề<input name="topic" required minLength={3} maxLength={100}
            placeholder="Ví dụ: Ăn uống, gia đình, tại nhà ga"/></label>
          <label>Trình độ JLPT
            <select name="jlptLevel" defaultValue="N5">
              {["N5","N4","N3","N2","N1"].map(level=><option key={level}>{level}</option>)}
            </select>
          </label>
          <label>Số lượng từ
            <select name="count" defaultValue="10">
              {[5,10,15,20].map(n=><option value={n} key={n}>{n} từ</option>)}
            </select>
          </label>
          <label>Yêu cầu bổ sung<input name="notes" maxLength={300}
            placeholder="Ví dụ: Từ thông dụng, có ví dụ đơn giản"/></label>
          <button type="submit" className="button primary" disabled={!configured || remaining === 0}>
            Tạo bằng AI
          </button>
        </form>
      </div>
      <div className="admin-panel">
        <h2>Lịch sử generate</h2>
        {jobs.length===0 ? <p className="muted">Chưa có tác vụ AI nào.</p> :
          <div className="review-list">{jobs.map(job=>
            <Link className="review-row" key={job.id} href={`/admin/ai-studio/${job.id}`}>
              <div className="review-description">
                <strong>{job.prompt}</strong>
                <p className="muted">{job.model} · {job.requestedCount} từ · {new Date(job.createdAt).toLocaleString("vi-VN")}</p>
              </div>
              <span className="level-badge">{job.status}</span>
            </Link>
          )}</div>}
      </div>
    </section>
  );
}
