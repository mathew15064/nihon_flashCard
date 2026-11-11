import VocabularyExplorer from "@/components/vocabulary-explorer";
export default function VocabularyPage() {
  return (
    <section className="content-page">
      <span className="eyebrow">日本語辞書 · Japanese Vocabulary</span>
      <h1>Kho từ vựng</h1>
      <p className="page-intro">Tra cứu từ tiếng Nhật theo cách viết, cách đọc và cấp độ JLPT.</p>
      <VocabularyExplorer />
    </section>
  );
}
