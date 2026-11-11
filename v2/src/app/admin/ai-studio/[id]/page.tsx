import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { getGenerationJob } from "@/modules/ai/service";
import { acceptCandidateAction, editCandidateAction, rejectCandidateAction } from "../actions";

const notices: Record<string,string> = {
  accepted:"Đã thêm từ vào kho nháp. Hãy kiểm duyệt trước khi xuất bản.",
  saved:"Đã cập nhật nội dung đề xuất.",
  rejected:"Đã loại từ đề xuất.",
};

export default async function GenerationDetails({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{result?:string}>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const job = getGenerationJob(id);
  if (!job) notFound();
  const { result } = await searchParams;
  return (
    <section className="content-page">
      <Link href="/admin/ai-studio" className="muted">← AI Studio</Link>
      <h1>{job.prompt}</h1>
      <p className="page-intro">{job.model} · {job.requestedCount} từ yêu cầu · {job.status}</p>
      <div className="ai-status">
        <span>Input tokens: {job.inputTokens ?? "—"}</span>
        <span>Output tokens: {job.outputTokens ?? "—"}</span>
        <span>{job.candidates.length} đề xuất</span>
      </div>
      {job.error && <p role="alert" className="notice form-error">Lỗi tạo dữ liệu: {job.error}. Không có từ nào được xuất bản.</p>}
      {result && <p className={result.startsWith("error:")?"notice form-error":"notice"} role="status">
        {notices[result] || ("Kết quả thao tác: "+result)}
      </p>}
      {job.candidates.length === 0 ? <div className="notice">Tác vụ không có đề xuất hợp lệ.</div>
        : <div className="candidate-list">{job.candidates.map((candidate,index)=>
          <article className="admin-panel candidate-card" key={candidate.id}>
            <div className="deck-heading"><h2>#{index+1} — {candidate.data.word}</h2>
              <span className="level-badge">{candidate.status==="pending"?"Chờ duyệt":candidate.status==="accepted"?"Đã lưu nháp":"Đã loại"}</span>
            </div>
            {candidate.duplicateId && <p className="notice form-error">Đã có từ tương tự trong kho. Kiểm tra trước khi lưu để tránh trùng.</p>}
            {candidate.status==="pending" ? <>
              <form action={editCandidateAction} className="admin-form">
                <input type="hidden" name="candidateId" value={candidate.id}/>
                <input type="hidden" name="jobId" value={id}/>
                <div className="form-grid">
                  <label>Từ tiếng Nhật<input name="word" required maxLength={120} defaultValue={candidate.data.word}/></label>
                  <label>Cách đọc Kana<input name="reading" required maxLength={120} defaultValue={candidate.data.reading}/></label>
                  <label>Romaji<input name="romanization" maxLength={120} defaultValue={candidate.data.romanization}/></label>
                  <label>Loại từ<input name="partOfSpeech" maxLength={80} defaultValue={candidate.data.partOfSpeech}/></label>
                  <label>JLPT<select name="jlptLevel" defaultValue={candidate.data.jlptLevel}>
                    {["unknown","N5","N4","N3","N2","N1"].map(x=><option key={x}>{x}</option>)}
                  </select></label>
                  <label>Nghĩa tiếng Việt<input name="meaningVi" required maxLength={500} defaultValue={candidate.data.meaningVi}/></label>
                  <label>Nghĩa tiếng Anh<input name="meaningEn" maxLength={500} defaultValue={candidate.data.meaningEn}/></label>
                  <label>Câu ví dụ tiếng Nhật<input name="exampleJa" maxLength={500} defaultValue={candidate.data.exampleJa}/></label>
                  <label>Dịch câu ví dụ<input name="exampleVi" maxLength={500} defaultValue={candidate.data.exampleVi}/></label>
                </div>
                <button className="button outline" type="submit">Lưu chỉnh sửa</button>
              </form>
              <div className="candidate-actions">
                <form action={acceptCandidateAction}>
                  <input type="hidden" name="candidateId" value={candidate.id}/>
                  <input type="hidden" name="jobId" value={id}/>
                  <button type="submit" className="button primary" disabled={Boolean(candidate.duplicateId)}>Thêm vào kho nháp</button>
                </form>
                <form action={rejectCandidateAction}>
                  <input type="hidden" name="candidateId" value={candidate.id}/>
                  <input type="hidden" name="jobId" value={id}/>
                  <button type="submit" className="button outline">Bỏ qua</button>
                </form>
              </div>
            </> : <div>
              <p>{candidate.data.reading} · {candidate.data.meaningVi}</p>
              {candidate.status==="accepted" && <Link href="/admin/vocabulary" className="button outline">Xem kho từ nháp</Link>}
            </div>}
          </article>
        )}</div>}
    </section>
  );
}
