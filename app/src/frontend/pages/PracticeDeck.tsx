import { useCallback, useEffect, useRef, useState } from "react";

type DueCard = {
  id: string;
  entryId: string;
  word: string;
  reading: string;
  meaningVi: string | null;
  jlptLevel: string | null;
  status: string;
  streak: number;
  timesReviewed: number;
  nextReviewAt: string | null;
};
type Deck = {id: string; name: string; description: string | null};
type Progress = {
  totalTracked: number; dueNow: number; todayReviews: number;
  enrolledDecks: number; nextDueAt: string | null;
  byStatus: Record<string,number>;
};
type ApiPayload<T> = {success: boolean; data?: T; error?: {code?:string}};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  const payload = await res.json() as ApiPayload<T>;
  if (!res.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.code || "Không thể kết nối tới máy chủ.");
  }
  return payload.data;
}

export default function PracticeDeck({initialDeckId}: {initialDeckId: string | null}) {
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [decks,setDecks] = useState<Deck[]>([]);
  const [progress,setProgress] = useState<Progress | null>(null);
  const [due,setDue] = useState<DueCard[]>([]);
  const [revealed,setRevealed] = useState(false);
  const [notice,setNotice] = useState("");
  // Keep the same request ID when retrying a review after an uncertain network result.
  const pendingReview = useRef<{cardId:string;result:"correct"|"wrong";requestId:string} | null>(null);

  const refresh = useCallback(async () => {
    const [progressData, dueData] = await Promise.all([
      requestJson<Progress>("/api/v1/me/progress"),
      requestJson<{items:DueCard[]}>("/api/v1/me/reviews/due?limit=20"),
    ]);
    setProgress(progressData);
    setDue(dueData.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await requestJson<{ready:boolean}>("/api/v1/me/session");
        const available = await requestJson<{items:Deck[]}>("/api/v1/decks");
        if (cancelled) return;
        setDecks(available.items);
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không khởi tạo được phiên học.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  async function enroll(endpoint: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{newCards:number;selected?:number;totalDeckEntries?:number}>(
        endpoint, {method:"POST"}
      );
      setNotice(result.newCards > 0
        ? `Đã thêm ${result.newCards} từ mới vào lịch học.`
        : "Các từ trong lựa chọn này đã có trong lịch học.");
      setRevealed(false);
      await refresh();
    } catch(err) {
      setError(err instanceof Error ? err.message : "Không thể bắt đầu học.");
    } finally { setBusy(false); }
  }

  async function submit(result: "correct" | "wrong") {
    const card = due[0];
    if (!card || !revealed || busy) return;
    const pending = pendingReview.current?.cardId === card.id
      ? pendingReview.current
      : { cardId:card.id, result, requestId:crypto.randomUUID() };
    pendingReview.current = pending;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson<{idempotent:boolean}>("/api/v1/me/reviews", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify(pending),
      });
      await refresh();
      pendingReview.current = null;
      setRevealed(false);
    } catch(err) {
      setError((err instanceof Error ? err.message : "Không thể lưu kết quả.")
        + " Nếu mạng gián đoạn, hãy thử lại cùng câu trả lời.");
    } finally { setBusy(false); }
  }

  const card = due[0];
  return <div className="learning-workspace">
    {loading ? <div className="notice" role="status">Đang khởi tạo phiên học và tải lịch ôn…</div> : <>
      {error && <div className="notice form-error" role="alert">{error==="GUEST_SESSION_NOT_CONFIGURED"
        ? "Phiên học chưa sẵn sàng. Hãy khởi động lại server hoặc liên hệ quản trị viên."
        : "Có lỗi: "+error}</div>}
      {progress && <div className="study-stats" aria-label="Tiến độ học tập">
        <div><strong>{progress.totalTracked}</strong><span>Từ đang học</span></div>
        <div><strong>{progress.dueNow}</strong><span>Đến hạn ôn</span></div>
        <div><strong>{progress.byStatus.mastered??0}</strong><span>Đã ghi nhớ</span></div>
        <div><strong>{progress.todayReviews}</strong><span>Lượt ôn hôm nay (UTC)</span></div>
      </div>}

      {card ? <div className="practice-area">
        <div className="practice-progress">Còn {progress?.dueNow??due.length} thẻ đến hạn · {card.jlptLevel??"Tiếng Nhật"}</div>
        <button className="practice-card" disabled={busy} type="button"
          onClick={()=>setRevealed(v=>!v)}
          aria-label={revealed?"Ẩn đáp án":"Lật thẻ để xem đáp án"}>
          <span className="eyebrow">{revealed?"Bạn đã nhớ đúng chưa?":"Hãy nhớ nghĩa và cách đọc"}</span>
          <strong>{card.word}</strong>
          {revealed ? <>
            <span className="practice-reading">{card.reading}</span>
            <span className="card-answer">{card.meaningVi??"Chưa có nghĩa tiếng Việt"}</span>
          </> : <span className="flip-hint">Chạm để lật thẻ ↻</span>}
        </button>
        {revealed ? <div className="practice-controls">
          <button className="button outline" type="button" disabled={busy}
            onClick={()=>submit("wrong")}>Chưa nhớ · 10 phút</button>
          <button className="button primary" type="button" disabled={busy}
            onClick={()=>submit("correct")}>Đã nhớ <span aria-hidden="true">✓</span></button>
        </div> : <p className="muted" style={{textAlign:"center",marginTop:15}}>
          Lật thẻ rồi đánh giá để cập nhật lịch SRS.</p>}
      </div> : <div className="notice study-empty">
        {progress?.totalTracked
          ? <>Bạn đã ôn xong các thẻ đến hạn! {progress.nextDueAt
              ? `Lần ôn kế tiếp: ${new Date(progress.nextDueAt).toLocaleString("vi-VN")}.`
              : "Bạn có thể chọn thêm bộ từ để học."}</>
          : "Chưa có từ nào trong lịch học. Hãy chọn một bộ từ hoặc bắt đầu với kho từ công khai."}
        <button className="button outline" type="button" disabled={busy} onClick={async()=>{
          setBusy(true); setError("");
          try { await refresh(); }
          catch(err){setError(err instanceof Error?err.message:"Không tải được dữ liệu.");}
          finally{setBusy(false);}
        }}>Cập nhật lịch ôn</button>
      </div>}

      <section className="study-enroll">
        <div className="deck-heading">
          <h2>Bắt đầu với bộ từ mới</h2>
          <span className="muted">Một từ chỉ có một tiến độ ôn, dù nằm trong nhiều bộ.</span>
        </div>
        <div className="study-deck-grid">
          <div className="admin-panel">
            <h3>Kho từ công khai</h3>
            <p className="muted">Thêm tối đa 20 từ đã xuất bản vào lịch học.</p>
            <button className="button outline" type="button" disabled={busy || loading || !progress}
              onClick={()=>enroll("/api/v1/me/vocabulary/enroll")}>Học từ vựng cơ bản</button>
          </div>
          {decks.map(deck=><div key={deck.id} className="admin-panel">
            <h3>{deck.name}</h3>
            <p className="muted">{deck.description??"Bộ từ tiếng Nhật"}</p>
            <button className={deck.id===initialDeckId?"button primary":"button outline"}
              type="button" disabled={busy || loading || !progress}
              onClick={()=>enroll("/api/v1/me/decks/"+deck.id+"/enroll")}>Học bộ này</button>
          </div>)}
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
        <p className="muted">Tiến độ thử nghiệm gắn với cookie của trình duyệt này.
          Xóa cookie hoặc đổi thiết bị có thể khiến bạn mất quyền truy cập tiến độ;
          chưa đồng bộ với tài khoản Nihon v1.</p>
      </section>
    </>}
  </div>;
}
