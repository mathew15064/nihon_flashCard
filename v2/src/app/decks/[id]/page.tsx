import { notFound } from "next/navigation";
import { getDeckWithEntries } from "@/modules/decks/service";

export default async function PublicDeckDetails({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = getDeckWithEntries(id);
  if (!deck) notFound();
  return (
    <section className="content-page">
      <span className="eyebrow">Nihon · Bộ từ vựng</span>
      <h1>{deck.name}</h1>
      <p className="page-intro">{deck.description ?? "Học từ vựng tiếng Nhật"}</p>
      <div className="vocab-grid">{deck.entries.map(entry=>
        <div className="vocab-tile" key={entry.id}>
          <div className="vocab-title"><strong>{entry.word}</strong><span className="level-badge">{entry.jlptLevel ?? "—"}</span></div>
          <p className="muted">{entry.reading}</p>
        </div>
      )}</div>
    </section>
  );
}
