import Link from "next/link";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">日本語 · Học từ vựng theo cách của bạn</span>
          <h1>Mỗi từ mới,<br/><em>một bước tiến.</em></h1>
          <p>Khám phá kho từ vựng tiếng Nhật, học theo chủ đề và luyện ghi nhớ cùng Nihon.</p>
          <div className="hero-actions">
            <Link href="/vocabulary" className="button primary">Khám phá từ vựng →</Link>
            <Link href="/practice" className="button outline">Luyện với flashcard</Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="card-top"><span>今日の言葉</span><span className="mini-dot"/></div>
          <div className="hero-japanese">食べる</div>
          <div className="hero-reading">たべる · taberu</div>
          <div className="hero-meaning">Ăn</div>
          <div className="hero-example">毎朝、パンを食べます。</div>
          <div className="card-bottom">Ví dụ từ vựng · Demo</div>
        </div>
      </section>
      <section className="features">
        <article><span className="feature-icon">本</span><h3>Kho từ vựng</h3><p>Tìm từ theo cách đọc, chủ đề và trình độ JLPT.</p></article>
        <article><span className="feature-icon">記</span><h3>Flashcard</h3><p>Luyện nhớ nghĩa và cách đọc với giao diện đơn giản.</p></article>
        <article><span className="feature-icon">AI</span><h3>AI + MCP</h3><p>Đưa từ mới vào kho qua AI Agent; nội dung được kiểm duyệt trước khi xuất bản.</p></article>
      </section>
    </>
  );
}
