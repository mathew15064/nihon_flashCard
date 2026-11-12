import {useEffect, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {api} from "../api";
import "../styles-topics.css";

type Topic = {id: string; name: string; description?: string | null};
export type PublicLesson = {
  id: string; name: string; description?: string | null;
  topicId?: string | null; visibility: "private" | "public";
};

// A response belongs to its URL: never show stale content after navigation.
export function usePublicData<T>(path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{path: string; data?: T; error?: string} | null>(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState(null);
    void api<T>(path, {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted) setState({path, data});
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({path, error: error instanceof Error ? error.message : "REQUEST_FAILED"});
    });
    return () => controller.abort();
  }, [path, attempt]);
  const current = state?.path === path ? state : null;
  return {
    data: current?.data,
    error: path ? current?.error : "NOT_FOUND",
    loading: Boolean(path && !current),
    retry: () => {setState(null); setAttempt(value => value + 1);},
  };
}

export function PublicLoadError({retry}: {retry: () => void}) {
  return <div className="notice lesson-notice" role="alert">
    <p>Không thể tải nội dung. Vui lòng kiểm tra kết nối và thử lại.</p>
    <button type="button" className="button outline" onClick={retry}>Thử lại</button>
  </div>;
}

export function LessonLinks({items}: {items: PublicLesson[]}) {
  return <ul className="topic-card-grid" aria-label="Các bài học công khai">
    {items.map(lesson => <li key={lesson.id}>
      <Link className="topic-browse-card" to={"/decks/" + encodeURIComponent(lesson.id)}>
        <h2>{lesson.name}</h2>
        <p>{lesson.description || "Từ vựng tiếng Nhật và nghĩa tiếng Việt."}</p>
        <span className="topic-card-action">Xem từ vựng và học <span aria-hidden="true">→</span></span>
      </Link>
    </li>)}
  </ul>;
}

export function TopicsPage() {
  const {data, loading, error, retry} = usePublicData<{items: Topic[]}>("/api/v1/topics");
  const items = data?.items ?? [];
  return <section className="content-page public-lessons" aria-labelledby="topics-heading">
    <span className="eyebrow">Nihon · Chủ đề</span>
    <h1 id="topics-heading">Học theo chủ đề</h1>
    <p className="page-intro">Chọn chủ đề, khám phá bài học và ôn từ vựng với SRS.</p>
    <p><Link className="topic-text-link" to="/decks">Xem tất cả bài học →</Link></p>
    {loading ? <div className="notice" role="status">Đang tải chủ đề…</div> :
      error ? <PublicLoadError retry={retry}/> :
      items.length === 0 ? <div className="notice" role="status">Chưa có chủ đề công khai. Hãy quay lại sau nhé.</div> :
      <ul className="topic-card-grid" aria-label="Các chủ đề">
        {items.map(topic => <li key={topic.id}>
          <Link className="topic-browse-card" to={"/topics/" + encodeURIComponent(topic.id) + "/lessons"}>
            <h2>{topic.name}</h2>
            <p>{topic.description || "Khám phá các bài học trong chủ đề này."}</p>
            <span className="topic-card-action">Khám phá bài học <span aria-hidden="true">→</span></span>
          </Link>
        </li>)}
      </ul>}
  </section>;
}

export function TopicLessonsPage() {
  const params = useParams();
  const topicId = params.topicId ?? params.id;
  const {data, loading, error, retry} = usePublicData<{items: PublicLesson[]}>(
    topicId ? "/api/v1/topics/" + encodeURIComponent(topicId) + "/lessons" : null,
  );
  const {data: topics} = usePublicData<{items: Topic[]}>("/api/v1/topics");
  const topic = topics?.items.find(item => item.id === topicId);
  const items = (data?.items ?? []).filter(item => item.visibility === "public");
  return <section className="content-page public-lessons" aria-labelledby="topic-lessons-heading">
    <Link className="topic-text-link" to="/topics">← Tất cả chủ đề</Link>
    <h1 id="topic-lessons-heading">{topic?.name ?? "Bài học theo chủ đề"}</h1>
    <p className="page-intro">{topic?.description || "Chọn bài học để xem từ vựng đã xuất bản và bắt đầu ôn tập."}</p>
    {loading ? <div className="notice" role="status">Đang tải bài học…</div> :
      error ? <PublicLoadError retry={retry}/> :
      items.length === 0 ? <div className="notice" role="status">Chủ đề này chưa có bài học công khai.</div> :
      <LessonLinks items={items}/>}
  </section>;
}
