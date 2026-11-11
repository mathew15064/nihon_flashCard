import {FormEvent,useCallback,useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {api,write} from "../api";

type Config={configured:boolean;model:string;dailyLimit:number;remaining:number};
type Candidate={
  id:string;status:"pending"|"accepted"|"rejected";duplicateId:string|null;
  data:{word:string;reading:string;romanization:string;partOfSpeech:string;
    jlptLevel:string;meaningVi:string;meaningEn:string;exampleJa:string;exampleVi:string};
};
type Job={id:string;prompt:string;model:string;status:string;requestedCount:number;
  inputTokens:number|null;outputTokens:number|null;error:string|null;createdAt:string;
  candidates:Candidate[]};
type ListedJob=Omit<Job,"candidates">;
function CandidateEditor({candidate,refresh}:{
  candidate:Candidate;refresh:()=>Promise<void>;
}){
  const [fields,setFields]=useState({...candidate.data});
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>setFields({...candidate.data}),[candidate.data]);
  async function act(url:string,body:unknown={},method="POST"){
    setBusy(true);setError("");
    try{await write(url,body,method);await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Không lưu được nội dung");}
    finally{setBusy(false);}
  }
  return <article className="admin-panel candidate-card">
    <div className="deck-heading"><h2>{candidate.data.word}</h2>
      <span className="status-pill">{candidate.status==="pending"?"Chờ duyệt":candidate.status==="accepted"?"Đã vào kho nháp":"Đã loại"}</span>
    </div>
    {candidate.duplicateId&&<div className="notice form-error">Từ tương tự đã tồn tại trong kho.</div>}
    {candidate.status==="pending"?<>
      <div className="form-grid admin-form">
        {(Object.keys(fields) as (keyof typeof fields)[]).map(key=>
          <label key={key}>{key}
            {key==="jlptLevel"?<select value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}>
              {["unknown","N5","N4","N3","N2","N1"].map(v=><option key={v}>{v}</option>)}
            </select>:<input value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}
              required={["word","reading","meaningVi"].includes(key)} maxLength={500}/>}
          </label>)}
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="candidate-actions">
        <button className="button outline" type="button" disabled={busy} onClick={()=>act(
          "/api/v1/admin/ai/candidates/"+candidate.id,fields,"PATCH"
        )}>Lưu chỉnh sửa</button>
        <button className="button primary" type="button" disabled={busy||Boolean(candidate.duplicateId)}
          onClick={()=>act("/api/v1/admin/ai/candidates/"+candidate.id+"/accept")}>Thêm vào kho nháp</button>
        <button className="button outline" type="button" disabled={busy}
          onClick={()=>act("/api/v1/admin/ai/candidates/"+candidate.id+"/reject")}>Bỏ qua</button>
      </div>
      <p className="muted">Sau khi chỉnh sửa hãy lưu trước, rồi mới chấp nhận bản đề xuất.</p>
    </>:<p className="muted">{candidate.data.reading} · {candidate.data.meaningVi}</p>}
  </article>;
}
export default function AIStudio(){
  const [config,setConfig]=useState<Config|null>(null),[jobs,setJobs]=useState<ListedJob[]>([]);
  const [selected,setSelected]=useState<Job|null>(null),[topic,setTopic]=useState("");
  const [level,setLevel]=useState("N5"),[count,setCount]=useState(10),[notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    const [conf,history]=await Promise.all([
      api<Config>("/api/v1/admin/ai/config"),
      api<{items:ListedJob[]}>("/api/v1/admin/ai/jobs"),
    ]);
    setConfig(conf);setJobs(history.items);
  },[]);
  const loadJob=useCallback(async(id:string)=>{
    setSelected(await api<Job>("/api/v1/admin/ai/jobs/"+id));
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
  async function generate(e:FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const result=await write<{id:string}>("/api/v1/admin/ai/jobs",{
        topic,jlptLevel:level,count,notes,
      });
      await refresh();await loadJob(result.id);
      setMessage("Đã tạo tác vụ. Kiểm tra từng từ trước khi chấp nhận.");
    }catch(e){setError(e instanceof Error?e.message:"Không tạo được dữ liệu");}
    finally{setBusy(false);}
  }
  return <section className="content-page">
    <span className="eyebrow">Nihon Admin · AI</span><h1>AI Vocabulary Studio</h1>
    <p className="page-intro">Tạo từ theo chủ đề, kiểm tra trùng, chỉnh sửa và lưu nháp. API key chỉ nằm trên server Fastify.</p>
    <nav className="nav-sub"><Link to="/admin">← Quản lý từ vựng</Link></nav>
    <div className="ai-status">
      <div><strong>OpenAI Responses API</strong><p className="muted">Model: {config?.model||"—"}</p></div>
      <span className="status-pill">{config?.configured?"Đã cấu hình key phía server":"Chưa có API key"}</span>
    </div>
    <p className="muted">Giới hạn 20 từ/lần · Còn {config?.remaining??"—"} / {config?.dailyLimit??"—"} lượt generate trong 24 giờ.</p>
    {!config?.configured&&<div className="notice">Chưa cấu hình OPENAI_API_KEY tại server; chức năng gọi AI đang tắt.</div>}
    {error&&<p role="alert" className="notice form-error">{error}</p>}
    {message&&<p role="status" className="notice">{message}</p>}
    <div className="admin-panel"><h2>Tạo danh sách từ</h2>
      <form className="form-grid admin-form" onSubmit={generate}>
        <label>Chủ đề<input required value={topic} minLength={3} maxLength={100} onChange={e=>setTopic(e.target.value)}
          placeholder="Ăn uống, gia đình, nhà ga…"/></label>
        <label>JLPT<select value={level} onChange={e=>setLevel(e.target.value)}>
          {["N5","N4","N3","N2","N1"].map(v=><option key={v}>{v}</option>)}
        </select></label>
        <label>Số từ<select value={count} onChange={e=>setCount(Number(e.target.value))}>
          {[5,10,15,20].map(n=><option key={n} value={n}>{n} từ</option>)}
        </select></label>
        <label>Ghi chú<input maxLength={300} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <button type="submit" className="button primary" disabled={!config?.configured||!config.remaining||busy}>
          {busy?"Đang tạo…":"Generate"}
        </button>
      </form>
    </div>
    <div className="admin-panel">
      <h2>Lịch sử tác vụ</h2>
      {jobs.length===0?<p className="muted">Chưa có tác vụ.</p>:<div className="review-list">
        {jobs.map(job=><button key={job.id} className="review-row quiet-button" type="button" onClick={()=>{
          void loadJob(job.id).catch(e=>setError(e.message));
        }}>
          <span className="review-description"><strong>{job.prompt}</strong>
            <span className="muted"> · {job.requestedCount} từ · {job.model}</span></span>
          <span className="status-pill">{job.status}</span>
        </button>)}
      </div>}
    </div>
    {selected&&<div className="candidate-list">
      <h2>Tác vụ: {selected.prompt}</h2>
      <div className="ai-status">
        <span>Trạng thái: {selected.status}</span>
        <span>Input tokens: {selected.inputTokens??"—"}</span>
        <span>Output tokens: {selected.outputTokens??"—"}</span>
      </div>
      {selected.error&&<div className="notice form-error">{selected.error}</div>}
      {selected.candidates.map(candidate=><CandidateEditor key={candidate.id} candidate={candidate}
        refresh={()=>loadJob(selected.id)}/>)}
    </div>}
  </section>;
}
