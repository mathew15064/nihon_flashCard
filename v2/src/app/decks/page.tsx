import Link from "next/link";
import { listDecks } from "@/modules/decks/service";

// New published decks must be visible without rebuilding the Next.js app.
export const dynamic = "force-dynamic";

export default function PublicDecksPage() {
  const available = listDecks();
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon · Vocabulary collections</span>
      <h1>Bộ từ vựng</h1>
      <p className="page-intro">Những bộ từ được Admin kiểm duyệt và xuất bản.</p>
      {available.length === 0 ? <div className="notice">Chưa có bộ từ công khai. Hãy quay lại khi Admin xuất bản nội dung.</div>
        : <div className="admin-grid">{available.map(deck=>
          <Link href={`/decks/${deck.id}`} className="admin-panel" key={deck.id}>
            <h2>{deck.name}</h2>
            <p className="muted">{deck.description || "Bộ từ vựng tiếng Nhật"}</p>
            <span className="level-badge">Xem bộ từ →</span>
          </Link>
        )}</div>}
    </section>
  );
}
