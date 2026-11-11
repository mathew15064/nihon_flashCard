"use client";
import { useEffect, useState } from "react";

type Entry = {
  id: string; word: string; reading: string; romanization?: string | null;
  jlptLevel?: string | null; senses: {id: string; language: string; meaning: string}[];
};
type Payload = {success: boolean; data?: {items: Entry[]}; error?: {code: string}};

export default function VocabularyExplorer() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (query.trim()) params.set("search", query.trim());
        if (level) params.set("jlpt", level);
        const response = await fetch("/api/v1/vocabulary?" + params, {signal: controller.signal});
        const payload = await response.json() as Payload;
        if (!response.ok || !payload.success) throw new Error(payload.error?.code || "REQUEST_FAILED");
        setEntries(payload.data?.items || []);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Không tải được dữ liệu");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    const timeout = setTimeout(load, 180);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, level]);
  return (
    <div>
      <div className="filters">
        <label className="search-box"><span>⌕</span><input aria-label="Tìm từ vựng" placeholder="Tìm chữ Nhật hoặc cách đọc..." value={query} onChange={e=>setQuery(e.target.value)} maxLength={80}/></label>
        <select aria-label="Cấp độ JLPT" value={level} onChange={e=>setLevel(e.target.value)}>
          <option value="">Tất cả cấp độ</option>
          {["N5","N4","N3","N2","N1"].map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      {loading ? <p role="status" className="muted">Đang tải từ vựng...</p> : error ? <div className="notice" role="alert">Không tải được kho từ: {error}. Hãy kiểm tra database và chạy migration.</div> : entries.length === 0 ? <div className="notice">Chưa có từ vựng đã xuất bản. Hãy thêm dữ liệu trong môi trường phát triển.</div> :
        <div className="vocab-grid">
          {entries.map(entry=><article className="vocab-tile" key={entry.id}>
            <div className="vocab-title"><strong>{entry.word}</strong>{entry.jlptLevel&&<span className="level-badge">{entry.jlptLevel}</span>}</div>
            <div className="muted">{entry.reading}{entry.romanization&&" · "+entry.romanization}</div>
            <div className="tile-rule"/>
            <p>{entry.senses.find(s=>s.language==="vi")?.meaning ?? entry.senses[0]?.meaning ?? "—"}</p>
          </article>)}
        </div>}
    </div>
  );
}
