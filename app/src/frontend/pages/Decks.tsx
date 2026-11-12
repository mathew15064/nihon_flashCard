import {useState} from "react";
import {Link, useParams} from "react-router-dom";
import {LessonLinks, PublicLoadError, usePublicData} from "./Topics";
import type {PublicLesson} from "./Topics";

type Entry = {
  id: string; word: string; reading: string; romanization?: string | null;
  jlptLevel?: string | null; meaningVi?: string | null; status: string;
};
type DeckDetail = PublicLesson & {entries: Entry[]};

export function Decks() {
  const {data, loading, error, retry} = usePublicData<{items: PublicLesson[]}>("/api/v1/decks");
  const items = (data?.items ?? []).filter(item => item.visibility === "public");
  return <section className="content-page public-lessons" aria-labelledby="decks-heading">
    <span className="eyebrow">Nihon · Bài học</span><h1 id="decks-heading">Bộ từ vựng</h1>
    <p className="page-intro">Học theo các bài học đã được kiểm duyệt.</p>
    <p><Link className="topic-text-link" to="/topics">Khám phá theo chủ đề →</Link></p>
    {loading ? <div className="notice" role="status">Đang tải bài học…</div> :
      error ? <PublicLoadError retry={retry}/> :
      items.length === 0 ? <div className="notice" role="status">Chưa có bài học công khai.</div> :
      <LessonLinks items={items}/>}
  </section>;
}

export function DeckDetails() {
  const {id} = useParams();
  const {data, loading, error, retry} = usePublicData<DeckDetail | null>(
    id ? "/api/v1/decks/" + encodeURIComponent(id) : null,
  );
  return <section className="content-page public-lessons" aria-labelledby="lesson-heading">
    <Link className="topic-text-link" to="/decks">← Tất cả bài học</Link>
    {loading ? <><h1 id="lesson-heading">Bài học</h1><div className="notice" role="status">Đang tải bộ từ…</div></> :
      error ? <><h1 id="lesson-heading">Không thể tải bài học</h1><PublicLoadError retry={retry}/></> :
      !data || data.visibility !== "public" ? <><h1 id="lesson-heading">Không tìm thấy bài học</h1>
        <p className="notice">Bài học này chưa được công khai hoặc không còn tồn tại.</p></> :
      <PublishedLesson key={data.id} data={data}/>}
  </section>;
}

function PublishedLesson({data}: {data: DeckDetail}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const entries = data.entries.filter(entry => entry.status === "published");
  const levels = [...new Set(entries.flatMap(entry => entry.jlptLevel ? [entry.jlptLevel] : []))].sort();
  const search = query.trim().toLocaleLowerCase("vi");
  const visible = entries.filter(entry => (!level || entry.jlptLevel === level) &&
    [entry.word, entry.reading, entry.romanization, entry.meaningVi].some(value =>
      value?.toLocaleLowerCase("vi").includes(search)));
  return <>
    <span className="eyebrow lesson-eyebrow">Nihon · Bộ từ vựng</span>
    <h1 id="lesson-heading">{data.name}</h1>
    <p className="page-intro">{data.description || "Học từ vựng tiếng Nhật"}</p>
    {data.topicId && <p><Link className="topic-text-link" to={"/topics/" + encodeURIComponent(data.topicId) + "/lessons"}>Xem các bài học cùng chủ đề →</Link></p>}
    <div className="lesson-study-actions">
      {entries.length > 0 && <Link className="button primary" to={"/practice?deck=" + encodeURIComponent(data.id)}>Học bộ từ này với SRS →</Link>}
      <p>{entries.length} từ đã xuất bản. Chọn “Học bộ này” trên trang ôn tập để thêm toàn bộ bài học vào lịch SRS.</p>
    </div>
    {entries.length === 0 ? <div className="notice" role="status">Bài học chưa có từ vựng đã xuất bản.</div> : <>
      <form className="lesson-filters" role="search" aria-label="Lọc từ vựng trong bài học" onSubmit={event => event.preventDefault()}>
        <label htmlFor="lesson-search">Tìm trong bài học
          <input id="lesson-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Từ, cách đọc, romaji hoặc nghĩa tiếng Việt"/>
        </label>
        <label htmlFor="lesson-level">Trình độ JLPT
          <select id="lesson-level" value={level} onChange={event => setLevel(event.target.value)}>
            <option value="">Tất cả trình độ</option>
            {levels.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </form>
      <p className="lesson-result-count" role="status">Hiển thị {visible.length} / {entries.length} từ</p>
      {visible.length === 0 ? <div className="notice lesson-notice">
        <p>Không có từ phù hợp với bộ lọc.</p>
        <button className="button outline" type="button" onClick={() => {setQuery(""); setLevel("");}}>Xóa bộ lọc</button>
      </div> : <ul className="lesson-vocabulary" aria-label="Từ vựng đã xuất bản">
        {visible.map(entry => <li className="lesson-word" key={entry.id}>
          <div className="lesson-word-heading"><h2 lang="ja">{entry.word}</h2>
            {entry.jlptLevel && <span className="level-badge" aria-label={"Trình độ " + entry.jlptLevel}>{entry.jlptLevel}</span>}
          </div>
          <dl>
            <div><dt>Cách đọc</dt><dd lang="ja">{entry.reading || "Chưa có cách đọc"}</dd></div>
            <div><dt>Romaji</dt><dd>{entry.romanization || "Chưa có romaji"}</dd></div>
            <div className="lesson-meaning"><dt>Nghĩa tiếng Việt</dt><dd lang="vi">{entry.meaningVi || "Chưa có nghĩa tiếng Việt"}</dd></div>
          </dl>
        </li>)}
      </ul>}
    </>}
  </>;
}
