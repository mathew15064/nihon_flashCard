import {FormEvent,useCallback,useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {api,write} from "../api";

type Sense={id:string;language:string;meaning:string};
type Entry={id:string;word:string;reading:string;jlptLevel:string|null;status:string;source:string;senses:Sense[]};
type Deck={id:string;name:string;description:string|null;visibility:string};
type Detail=Deck&{entries:{id:string;word:string;reading:string;status:string}[]};
function Nav(){return <nav className="nav-sub"><Link to="/admin">Quản lý từ và bộ từ</Link><Link to="/admin/ai-studio">AI Vocabulary Studio</Link><Link to="/admin/settings">Cài đặt hệ thống</Link></nav>;}
export default function Admin(){
  const [items,setItems]=useState<Entry[]>([]),[decks,setDecks]=useState<Detail[]>([]);
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [word,setWord]=useState(""),[reading,setReading]=useState(""),[meaningVi,setMeaningVi]=useState(""),[jlpt,setJlpt]=useState("");
  const [deckName,setDeckName]=useState(""),[deckDesc,setDeckDesc]=useState("");
  const refresh=useCallback(async()=>{
    try{
      const [vocab,decksResponse]=await Promise.all([
        api<{items:Entry[]}>("/api/v1/admin/vocabulary?limit=100"),
        api<{items:Deck[]}>("/api/v1/admin/decks"),
      ]);
      setItems(vocab.items);
      const details=await Promise.all(decksResponse.items.map(d=>api<Detail>("/api/v1/admin/decks/"+d.id)));
      setDecks(details);setError("");
    }catch(e){setError(e instanceof Error?e.message:"ADMIN_LOAD_FAILED");}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function action(call:()=>Promise<unknown>,messageText:string){
    setBusy(true);setError("");setMessage("");
    try{await call();setMessage(messageText);await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Không lưu được dữ liệu");}
    finally{setBusy(false);}
  }
  async function addWord(event:FormEvent){
    event.preventDefault();
    await action(async()=>{
      await write("/api/v1/admin/vocabulary",{
        language:"ja",word,reading,meaningVi,jlptLevel:jlpt||null,
      });
      setWord("");setReading("");setMeaningVi("");
    },"Đã lưu từ vựng dưới dạng bản nháp.");
  }
  async function addDeck(event:FormEvent){
    event.preventDefault();
    await action(async()=>{
      await write("/api/v1/admin/decks",{name:deckName,description:deckDesc});
      setDeckName("");setDeckDesc("");
    },"Đã tạo bộ từ riêng tư.");
  }
  const drafts=items.filter(e=>e.status==="draft");
  const published=items.filter(e=>e.status==="published");
  return <section className="content-page">
    <span className="eyebrow">Nihon Admin · Editorial</span><h1>Quản trị nội dung</h1>
    <p className="page-intro">Duyệt từ vựng nháp và tổ chức bộ từ trước khi xuất bản.</p>
    <Nav/>
    <div className="study-stats">
      <div><strong>{drafts.length}</strong><span>Từ chờ duyệt</span></div>
      <div><strong>{published.length}</strong><span>Từ đã xuất bản</span></div>
      <div><strong>{decks.length}</strong><span>Tổng bộ từ</span></div>
      <div><strong>{decks.filter(d=>d.visibility==="public").length}</strong><span>Bộ đã xuất bản</span></div>
    </div>
    {error&&<div role="alert" className="notice form-error">{error}</div>}
    {message&&<div role="status" className="notice">{message}</div>}
    <div className="admin-panel">
      <h2>Thêm từ mới</h2>
      <form className="form-grid admin-form" onSubmit={addWord}>
        <label>Tiếng Nhật<input name="word" value={word} onChange={e=>setWord(e.target.value)} required maxLength={120}/></label>
        <label>Kana<input name="reading" value={reading} onChange={e=>setReading(e.target.value)} required maxLength={120}/></label>
        <label>Nghĩa tiếng Việt<input name="meaning" value={meaningVi} onChange={e=>setMeaningVi(e.target.value)} required maxLength={500}/></label>
        <label>JLPT<select value={jlpt} onChange={e=>setJlpt(e.target.value)}>
          <option value="">Chưa xác định</option>
          {["N5","N4","N3","N2","N1"].map(v=><option key={v}>{v}</option>)}
        </select></label>
        <button className="button primary" type="submit" disabled={busy}>Lưu bản nháp</button>
      </form>
    </div>
    <div className="admin-panel">
      <h2>Từ chờ duyệt ({drafts.length})</h2>
      {drafts.length===0?<p className="muted">Không có từ đang chờ duyệt.</p>:
      <div className="review-list">{drafts.map(item=><article className="review-row" key={item.id}>
        <div className="review-description">
          <strong>{item.word}</strong> <span className="muted">{item.reading} · {item.jlptLevel||"—"}</span>
          <p>{item.senses.find(s=>s.language==="vi")?.meaning||"Chưa có nghĩa tiếng Việt"}</p>
          <small className="muted">Nguồn: {item.source}</small>
        </div>
        <button type="button" disabled={busy} className="button primary" onClick={()=>action(
          ()=>write("/api/v1/admin/vocabulary/"+item.id+"/publish",{}),
          "Đã xuất bản từ "+item.word
        )}>Xuất bản</button>
      </article>)}</div>}
    </div>
    <div className="admin-panel">
      <h2>Đã xuất bản ({published.length})</h2>
      <p className="muted">{published.slice(0,35).map(e=>e.word).join(" · ")||"Chưa có từ."}</p>
      <p className="muted">Hiển thị tối đa 100 từ trên trang quản trị này.</p>
    </div>
    <div className="admin-panel">
      <h2>Tạo bộ từ</h2>
      <form className="form-grid admin-form" onSubmit={addDeck}>
        <label>Tên bộ từ<input value={deckName} onChange={e=>setDeckName(e.target.value)} minLength={2} maxLength={100} required/></label>
        <label>Mô tả<input value={deckDesc} onChange={e=>setDeckDesc(e.target.value)} maxLength={1000}/></label>
        <button className="button primary" type="submit" disabled={busy}>Tạo bộ từ riêng tư</button>
      </form>
    </div>
    <div className="admin-grid">
      {decks.map(deck=><article className="admin-panel" key={deck.id}>
        <div className="deck-heading"><h2>{deck.name}</h2><span className="status-pill">{deck.visibility==="public"?"Công khai":"Riêng tư"}</span></div>
        <p className="muted">{deck.description||"Chưa có mô tả."}</p>
        <p>{deck.entries.length} từ: <span className="muted">{deck.entries.map(e=>e.word).join(" · ")||"Chưa có từ"}</span></p>
        <label className="form-vertical">Thêm từ vào bộ
          <select className="select-input" defaultValue="" disabled={busy}
            onChange={event=>{
              const id=event.target.value;
              event.target.value="";
              if(!id)return;
              void action(()=>write("/api/v1/admin/decks/"+deck.id+"/entries",{entryId:id}),"Đã thêm từ.");
            }}>
            <option value="">Chọn từ…</option>
            {items.filter(e=>!deck.entries.some(d=>d.id===e.id))
              .filter(e=>deck.visibility==="private"||e.status==="published")
              .map(item=><option key={item.id} value={item.id}>{item.word} ({item.status})</option>)}
          </select>
        </label>
        {deck.visibility==="private" && <button type="button" disabled={busy}
          className="button primary" onClick={()=>action(
            ()=>write("/api/v1/admin/decks/"+deck.id+"/publish",{}),
            "Đã xuất bản bộ "+deck.name
          )}>Xuất bản bộ từ</button>}
        <p className="muted">Chỉ xuất bản bộ từ khi mọi mục đã được duyệt.</p>
      </article>)}
    </div>
  </section>;
}
