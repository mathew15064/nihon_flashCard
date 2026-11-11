import PracticeDeck from "@/components/practice-deck";
export default function PracticePage() {
  return <section className="content-page">
    <span className="eyebrow">Flashcard Preview</span><h1>Luyện ghi nhớ</h1>
    <p className="page-intro">Lật thẻ để kiểm tra nghĩa và cách đọc. Đây là bài tập thử: tiến độ chưa được lưu vào SRS.</p>
    <PracticeDeck/>
  </section>;
}
