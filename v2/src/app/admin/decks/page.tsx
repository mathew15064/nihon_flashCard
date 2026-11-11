import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { listVocabulary } from "@/modules/vocabulary/service";
import { getDeckWithEntries, listDecks } from "@/modules/decks/service";
import { addEntryAction, createDeckAction, publishDeckAction } from "./actions";

export default async function AdminDecksPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { error } = await searchParams;
  const decks = listDecks(true);
  const { items } = listVocabulary({ includeDrafts: true, limit: 100 });
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon Admin · Organization</span>
      <h1>Quản lý bộ từ</h1>
      <p className="page-intro">Tạo bộ từ và gắn những mục từ đã duyệt. Bộ từ chưa được công khai cho đến khi được xuất bản.</p>
      {error && <div className="notice form-error" role="alert">Không thể thực hiện: {error}</div>}
      <div className="admin-panel">
        <h2>Tạo bộ từ mới</h2>
        <form action={createDeckAction} className="admin-form form-grid">
          <label>Tên bộ từ<input name="name" minLength={2} maxLength={100} required placeholder="例: Từ vựng N5 — Ăn uống"/></label>
          <label>Mô tả<input name="description" maxLength={1000} placeholder="Giới thiệu ngắn"/></label>
          <button type="submit" className="button primary">Tạo bộ từ riêng tư</button>
        </form>
      </div>
      {decks.length === 0 ? <div className="notice">Chưa có bộ từ nào. Hãy tạo một bộ đầu tiên.</div> :
      <div className="admin-grid">
        {decks.map(deck => {
          const details = getDeckWithEntries(deck.id, true)!;
          return (
            <article key={deck.id} className="admin-panel">
              <div className="deck-heading"><h2>{deck.name}</h2><span className="level-badge">{deck.visibility === "public" ? "Đã công khai" : "Riêng tư"}</span></div>
              <p className="muted">{deck.description ?? "Chưa có mô tả"}</p>
              <p>{details.entries.length} từ vựng</p>
              {details.entries.length > 0 && <p className="muted">{details.entries.map(e=>e.word).join(" · ")}</p>}
              <form action={addEntryAction} className="admin-form">
                <input type="hidden" name="deckId" value={deck.id}/>
                <label>Thêm từ vào bộ
                  <select name="entryId" required defaultValue="">
                    <option value="" disabled>Chọn từ</option>
                    {items.filter(e=>!details.entries.some(i=>i.id===e.id)).map(e=>
                      <option value={e.id} key={e.id}>{e.word} — {e.reading} ({e.status})</option>
                    )}
                  </select>
                </label>
                <button type="submit" className="button outline">Thêm từ</button>
              </form>
              {deck.visibility === "private" && <form action={publishDeckAction}>
                <input type="hidden" name="deckId" value={deck.id}/>
                <button type="submit" className="button primary">Xuất bản bộ từ</button>
                <p className="muted">Chỉ xuất bản khi mọi từ trong bộ đã được duyệt.</p>
              </form>}
            </article>
          );
        })}
      </div>}
    </section>
  );
}
