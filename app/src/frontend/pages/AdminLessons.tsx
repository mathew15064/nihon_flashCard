import {useEffect,useRef,useState} from "react";
import type {FormEvent} from "react";
import {Link} from "react-router-dom";
import {api,write} from "../api";

type Topic={id:string;name:string;description?:string|null};
type Lesson={id:string;name:string;description?:string|null;topicId?:string|null;visibility:string};
type Entry={id:string;word:string;reading:string;romanization?:string|null;jlptLevel?:string|null;status:string;meaningVi?:string|null};
type Detail=Lesson&{entries:Entry[]};
type BatchResult={lessonId:string;received:number;created:number;duplicates:number;linked:number;alreadyLinked:number;errors:{index:number;code:string}[]};
type PublishResult={published:number;skipped:number;errors:{id:string;code:string}[]};
const path=(id:string)=>"/api/v1/admin/lessons/"+encodeURIComponent(id);
const errorText=(e:unknown)=>e instanceof Error?e.message:"REQUEST_FAILED";
const sample='[\n  {"word":"食べる","reading":"たべる","meaningVi":"Ăn","jlptLevel":"N5"}\n]';

export default function AdminLessons(){
  const [topics,setTopics]=useState<Topic[]>([]),[lessons,setLessons]=useState<Lesson[]>([]);
  const [catalogLoading,setCatalogLoading]=useState(true),[catalogError,setCatalogError]=useState("");
  const [catalogRevision,setCatalogRevision]=useState(0),[detailRevision,setDetailRevision]=useState(0);
  const [topicFilter,setTopicFilter]=useState(""),[lessonId,setLessonId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState("");
  const [topicName,setTopicName]=useState(""),[topicDescription,setTopicDescription]=useState("");
  const [lessonName,setLessonName]=useState(""),[lessonDescription,setLessonDescription]=useState(""),[newTopicId,setNewTopicId]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [json,setJson]=useState(""),[batchResult,setBatchResult]=useState<BatchResult|null>(null),[publishResult,setPublishResult]=useState<PublishResult|null>(null);
  const [filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[selected,setSelected]=useState<string[]>([]);
  const mutationLock=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setCatalogLoading(true);setCatalogError("");
    void Promise.all([api<{items:Topic[]}>("/api/v1/admin/topics",{signal:controller.signal}),api<{items:Lesson[]}>("/api/v1/admin/lessons",{signal:controller.signal})])
      .then(([t,l])=>{if(!controller.signal.aborted){setTopics(t.items);setLessons(l.items);}})
      .catch(e=>{if(!controller.signal.aborted)setCatalogError(errorText(e));})
      .finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
    return ()=>controller.abort();
  },[catalogRevision]);
  useEffect(()=>{
    const controller=new AbortController();setDetail(null);setDetailError("");setSelected([]);
    if(!lessonId){setDetailLoading(false);return ()=>controller.abort();}
    setDetailLoading(true);
    void api<Detail>(path(lessonId),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setDetail(data);})
      .catch(e=>{if(!controller.signal.aborted)setDetailError(errorText(e));})
      .finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
    return ()=>controller.abort();
  },[lessonId,detailRevision]);
  function chooseLesson(id:string){
    setLessonId(id);setDetail(null);setDetailError("");setSelected([]);setBatchResult(null);setPublishResult(null);
    setMessage("");setError("");setJson("");setQuery("");setFilter("all");
  }
  function reloadDetail(){setDetail(null);setSelected([]);setDetailRevision(v=>v+1);}
  async function mutate(task:()=>Promise<void>){
    if(mutationLock.current)return;
    mutationLock.current=true;setBusy(true);setError("");setMessage("");
    try{await task();}catch(e){setError("Không thể xác nhận thao tác: "+errorText(e)+". Hãy tải lại dữ liệu trước khi thử lại.");}
    finally{mutationLock.current=false;setBusy(false);}
  }
  async function createTopic(event:FormEvent){
    event.preventDefault();await mutate(async()=>{
      const t=await write<Topic>("/api/v1/admin/topics",{name:topicName.trim(),description:topicDescription.trim()||undefined});
      setTopics(items=>[...items.filter(x=>x.id!==t.id),t]);setNewTopicId(t.id);setTopicName("");setTopicDescription("");setMessage("Đã tạo chủ đề: "+t.name);
    });
  }
  async function createLesson(event:FormEvent){
    event.preventDefault();await mutate(async()=>{
      const l=await write<Lesson>("/api/v1/admin/lessons",{name:lessonName.trim(),description:lessonDescription.trim()||undefined,topicId:newTopicId||undefined});
      setLessons(items=>[...items.filter(x=>x.id!==l.id),l]);setTopicFilter("");chooseLesson(l.id);setLessonName("");setLessonDescription("");setMessage("Đã tạo bài học: "+l.name);
    });
  }
  async function importBatch(event:FormEvent){
    event.preventDefault();setBatchResult(null);setPublishResult(null);setError("");setMessage("");let items:unknown;
    try{items=JSON.parse(json);}catch{setError("JSON không hợp lệ. Hãy dán danh sách dạng [ {...}, {...} ].");return;}
    if(!Array.isArray(items)||items.length<1||items.length>100){setError("Mỗi lần nhập phải là danh sách JSON gồm 1–100 từ.");return;}
    if(items.some(x=>!x||typeof x!=="object"||Array.isArray(x))){setError("Mỗi phần tử phải là một đối tượng JSON.");return;}
    await mutate(async()=>{setBatchResult(await write<BatchResult>(path(lessonId)+"/batch",{items}));reloadDetail();});
  }
  async function publish(entryIds?:string[]){
    setPublishResult(null);setBatchResult(null);
    await mutate(async()=>{setPublishResult(await write<PublishResult>(path(lessonId)+(entryIds?"/publish-selected":"/publish-all"),entryIds?{entryIds}:{}));reloadDetail();});
  }
  async function publishDeck(){
    await mutate(async()=>{await write(path(lessonId)+"/publish",{});setMessage("Máy chủ đã xác nhận xuất bản bài học.");reloadDetail();setCatalogRevision(v=>v+1);});
  }
  const visibleLessons=lessons.filter(l=>!topicFilter||(topicFilter==="none"?!l.topicId:l.topicId===topicFilter));
  const drafts=detail?.entries.filter(e=>e.status==="draft")??[],published=detail?.entries.filter(e=>e.status==="published")??[];
  const visibleEntries=detail?.entries.filter(e=>(filter==="all"||e.status===filter)&&[e.word,e.reading,e.romanization,e.meaningVi].some(v=>v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))??[];
  const visibleDraftIds=visibleEntries.filter(e=>e.status==="draft").map(e=>e.id);
  const allVisibleSelected=visibleDraftIds.length>0&&visibleDraftIds.every(id=>selected.includes(id));
  const locked=busy||detailLoading;
  const allPublished=!!detail&&detail.entries.length>0&&detail.entries.every(e=>e.status==="published");
  return <section className="content-page lesson-admin">
    <span className="eyebrow">Nihon Admin</span><h1>Quản lý bài học</h1>
    <p className="page-intro">Tạo chủ đề, nhập từ vựng theo lô và duyệt bản nháp trước khi công khai bài học.</p>
    <nav className="nav-sub" aria-label="Quản trị"><Link to="/admin">Kho từ vựng</Link><Link to="/admin/lessons" aria-current="page">Bài học</Link><Link to="/admin/ai-studio">AI Studio</Link><Link to="/admin/settings">Cài đặt</Link></nav>
    {error&&<div className="notice form-error" role="alert">{error}<button type="button" className="button outline" disabled={busy} onClick={()=>{setCatalogRevision(v=>v+1);reloadDetail();}}>Tải lại dữ liệu</button></div>}
    {message&&<p className="notice" role="status">{message}</p>}
    <div className="admin-grid lesson-create-grid">
      <section className="admin-panel"><h2>Tạo chủ đề</h2><form className="admin-form" onSubmit={createTopic}>
        <label>Tên chủ đề<input value={topicName} onChange={e=>setTopicName(e.target.value)} required maxLength={100} disabled={busy}/></label>
        <label>Mô tả chủ đề<textarea value={topicDescription} onChange={e=>setTopicDescription(e.target.value)} maxLength={1000} rows={2} disabled={busy}/></label>
        <button className="button primary" disabled={busy||catalogLoading||!topicName.trim()} type="submit">Tạo chủ đề</button>
      </form></section>
      <section className="admin-panel"><h2>Tạo bài học</h2><form className="admin-form" onSubmit={createLesson}>
        <label>Tên bài học<input value={lessonName} onChange={e=>setLessonName(e.target.value)} required minLength={2} maxLength={100} disabled={busy}/></label>
        <label>Mô tả bài học<textarea value={lessonDescription} onChange={e=>setLessonDescription(e.target.value)} maxLength={1000} rows={2} disabled={busy}/></label>
        <label>Chủ đề<select value={newTopicId} onChange={e=>setNewTopicId(e.target.value)} disabled={busy||catalogLoading||!!catalogError}><option value="">Không có chủ đề</option>{topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <button className="button primary" disabled={busy||lessonName.trim().length<2||catalogLoading||!!catalogError} type="submit">Tạo bài học riêng tư</button>
      </form></section>
    </div>
    <section className="admin-panel" aria-busy={catalogLoading}><h2>Chủ đề và bài học</h2>
      {catalogLoading&&<p role="status">Đang tải danh sách…</p>}
      {catalogError&&<div role="alert" className="form-error"><p>Không tải được danh sách: {catalogError}</p><button className="button outline" type="button" onClick={()=>setCatalogRevision(v=>v+1)}>Thử tải lại danh sách</button></div>}
      {!catalogLoading&&!catalogError&&<>
        <p className="muted">{topics.length} chủ đề · {lessons.length} bài học</p>
        <div className="form-grid admin-form">
          <label>Lọc theo chủ đề<select value={topicFilter} disabled={locked} onChange={e=>{setTopicFilter(e.target.value);chooseLesson("");}}><option value="">Tất cả chủ đề</option><option value="none">Không có chủ đề</option>{topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label>Chọn bài học<select value={lessonId} disabled={locked} onChange={e=>chooseLesson(e.target.value)}><option value="">Chọn bài học…</option>{visibleLessons.map(l=><option key={l.id} value={l.id}>{l.name} · {l.visibility==="public"?"Công khai":"Riêng tư"}</option>)}</select></label>
        </div>
        {topicFilter&&topicFilter!=="none"&&<p className="muted">{topics.find(t=>t.id===topicFilter)?.description||"Chủ đề chưa có mô tả."}</p>}
        {visibleLessons.length===0?<p>Chưa có bài học trong danh sách này.</p>:<ul className="lesson-catalog" aria-label="Danh sách bài học">{visibleLessons.map(l=><li key={l.id}><button type="button" disabled={locked} aria-pressed={lessonId===l.id} onClick={()=>{if(l.id!==lessonId)chooseLesson(l.id);}}><strong>{l.name}</strong><span>{topics.find(t=>t.id===l.topicId)?.name||"Không có chủ đề"} · {l.visibility==="public"?"Công khai":"Riêng tư"}</span></button></li>)}</ul>}
        <button type="button" className="button outline" disabled={locked} onClick={()=>{setCatalogRevision(v=>v+1);if(lessonId)reloadDetail();}}>Làm mới danh sách và chi tiết</button>
      </>}
    </section>
    {detailLoading&&<p className="notice" role="status">Đang tải toàn bộ từ vựng của bài học…</p>}
    {detailError&&<div className="notice form-error" role="alert"><p>Không tải được chi tiết: {detailError}</p><button className="button outline" type="button" onClick={reloadDetail}>Thử tải lại chi tiết</button></div>}
    {!lessonId&&<p className="notice">Chọn một bài học để nhập và duyệt từ vựng.</p>}
    {batchResult&&<section className="notice" role="status"><h2>Kết quả nhập lô</h2><p>Nhận: {batchResult.received} · Tạo mới: {batchResult.created} · Trùng: {batchResult.duplicates} · Thêm vào bài: {batchResult.linked} · Đã có trong bài: {batchResult.alreadyLinked} · Lỗi: {batchResult.errors.length}</p>{batchResult.errors.length>0&&<><p>Các mục lỗi chưa được nhập. Sửa các mục này trước khi gửi lại.</p><ul>{batchResult.errors.map((e,i)=><li key={i}>Vị trí JSON (index): {e.index} — {e.code}</li>)}</ul></>}</section>}
    {publishResult&&<section className="notice" role="status"><h2>Kết quả duyệt từ</h2><p>Đã xuất bản: {publishResult.published} · Bỏ qua: {publishResult.skipped} · Lỗi: {publishResult.errors.length}</p>{publishResult.errors.length>0&&<ul>{publishResult.errors.map((e,i)=><li key={i}>ID {e.id}: {e.code}</li>)}</ul>}</section>}
    {detail&&<>
      <section className="admin-panel"><div className="deck-heading"><h2>{detail.name}</h2><span className="status-pill">{detail.visibility==="public"?"Công khai":"Riêng tư"}</span></div><p>{detail.description||"Chưa có mô tả."}</p>
        <div className="study-stats"><div><strong>{detail.entries.length}</strong><span>Tổng từ</span></div><div><strong>{drafts.length}</strong><span>Bản nháp</span></div><div><strong>{published.length}</strong><span>Đã xuất bản</span></div><div><strong>{selected.length}</strong><span>Đã chọn</span></div></div>
        {detail.visibility!=="public"&&<><p id="lesson-publish-help" className="muted">Chỉ có thể công khai bài học có ít nhất một từ và mọi từ đều đã xuất bản.</p><button type="button" className="button primary" aria-describedby="lesson-publish-help" disabled={busy||!allPublished} onClick={()=>{if(window.confirm('Công khai bài học “'+detail.name+'” cho người học?'))void publishDeck();}}>Xuất bản bài học</button></>}
      </section>
      <section className="admin-panel"><h2>Nhập từ vựng JSON</h2><p id="batch-help">Dán danh sách 1–100 đối tượng. Mỗi từ gồm word, reading, meaningVi; có thể thêm romanization, jlptLevel. Từ mới được lưu thành bản nháp.</p>
        <details><summary>Xem JSON mẫu</summary><pre className="lesson-json-example">{sample}</pre></details>
        <form className="admin-form" onSubmit={importBatch}><label htmlFor="lesson-batch">Danh sách từ vựng JSON</label><textarea id="lesson-batch" aria-describedby="batch-help" value={json} onChange={e=>setJson(e.target.value)} rows={9} spellCheck={false} required disabled={busy} placeholder={sample}/><button type="submit" className="button primary" disabled={busy||!json.trim()}>Nhập vào bài học</button></form>
      </section>
      <section className="admin-panel"><h2>Từ vựng trong bài học</h2>
        <div className="form-grid admin-form"><label>Trạng thái<select value={filter} onChange={e=>setFilter(e.target.value)} disabled={busy}><option value="all">Tất cả ({detail.entries.length})</option><option value="draft">Bản nháp ({drafts.length})</option><option value="published">Đã xuất bản ({published.length})</option></select></label><label>Tìm trong bài học<input type="search" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy} placeholder="Từ, cách đọc, nghĩa…"/></label></div>
        <p className="muted">Hiển thị {visibleEntries.length} / {detail.entries.length} từ. Đã chọn {selected.length} bản nháp, kể cả các từ đang bị ẩn bởi bộ lọc.</p>
        <div className="lesson-toolbar"><label className="lesson-check"><input type="checkbox" checked={allVisibleSelected} disabled={busy||visibleDraftIds.length===0} onChange={e=>setSelected(ids=>e.target.checked?[...new Set([...ids,...visibleDraftIds])]:ids.filter(id=>!visibleDraftIds.includes(id)))}/>Chọn bản nháp đang hiển thị</label><button type="button" className="button outline" disabled={busy||selected.length===0} onClick={()=>setSelected([])}>Bỏ chọn hết</button></div>
        <div className="lesson-toolbar"><button type="button" className="button primary" disabled={busy||selected.length===0} onClick={()=>{if(window.confirm('Xuất bản '+selected.length+' từ đã chọn?'))void publish(selected);}}>Xuất bản {selected.length} từ đã chọn</button><button type="button" className="button outline" disabled={busy||drafts.length===0} onClick={()=>{if(window.confirm('Xuất bản tất cả '+drafts.length+' từ nháp trong bài “'+detail.name+'”, kể cả từ đang ẩn bởi bộ lọc?'))void publish();}}>Xuất bản tất cả bản nháp ({drafts.length})</button></div>
        {visibleEntries.length===0?<p>Không có từ phù hợp.</p>:<ul className="lesson-entry-list">{visibleEntries.map(entry=><li className="lesson-entry" key={entry.id}>
          <label className="lesson-check"><input type="checkbox" aria-label={"Chọn từ "+entry.word} disabled={busy||entry.status!=="draft"} checked={selected.includes(entry.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,entry.id]:ids.filter(id=>id!==entry.id))}/><span className="lesson-word" lang="ja">{entry.word}</span></label>
          <div className="lesson-entry-body"><p><span lang="ja">{entry.reading}</span>{entry.romanization&&<> · {entry.romanization}</>}{entry.jlptLevel&&<> · {entry.jlptLevel}</>}</p><p>{entry.meaningVi||"Chưa có nghĩa tiếng Việt"}</p><span className="status-pill">{entry.status==="published"?"Đã xuất bản":entry.status==="draft"?"Bản nháp":entry.status}</span></div>
          {entry.status==="draft"&&<button className="button outline" type="button" disabled={busy} aria-label={"Xuất bản từ "+entry.word} onClick={()=>{if(window.confirm('Xuất bản từ “'+entry.word+'”?'))void publish([entry.id]);}}>Xuất bản</button>}
        </li>)}</ul>}
      </section>
    </>}
    {busy&&<p className="notice" role="status">Đang gửi yêu cầu, vui lòng chờ xác nhận từ máy chủ…</p>}
  </section>;
}
