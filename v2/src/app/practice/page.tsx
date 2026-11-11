import PracticeDeck from "@/components/practice-deck";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  searchParams,
}: {searchParams: Promise<{deck?: string}>}) {
  const { deck } = await searchParams;
  const initialDeckId = typeof deck === "string" && /^[0-9a-f-]{36}$/i.test(deck) ? deck : null;
  return <section className="content-page">
    <span className="eyebrow">Flashcard · Spaced Repetition</span>
    <h1>Ôn tập từ vựng</h1>
    <p className="page-intro">
      Học từ mới và ôn tập đúng lúc bằng SRS. Tiến độ thử nghiệm được lưu theo trình duyệt
      trên server, không còn là flashcard xem thử.
    </p>
    <PracticeDeck initialDeckId={initialDeckId} />
  </section>;
}
