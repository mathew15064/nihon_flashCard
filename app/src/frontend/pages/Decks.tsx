import {useEffect,useState} from "react";
import {Link,useParams} from "react-router-dom";
import {api} from "../api";
type Deck={id:string;name:string;description:string|null;visibility:"private"|"public"};
type Entry={id:string;word:string;reading:string;jlptLevel:string|null};
export function Decks(){
  const [items,setItems]=useState<Deck[]>([]),[error,setError]=useState("");
  useEffect(()=>{void api<{items:Deck[]}>("/api/v1/decks").then(r=>setItems(r.items)).catch(e=>setError(e.message));},[]);
  return <section className="content-page">
    <span className="eyebrow">Nihon · Collections</span><h1>Bộ từ vựng</h1>
    <p className="page-intro">Học theo các bộ từ đã được kiểm duyệt.</p>
    {error?<div className="notice">{error}</div>:items.length===0?<div className="notice">Chưa có bộ từ công khai.</div>:
    <div className="admin-grid">{items.map(deck=><Link to={"/decks/"+deck.id} className="admin-panel" key={deck.id}>
      <h2>{deck.name}</h2><p className="muted">{deck.description||"Bộ từ vựng Nhật — Việt"}</p>
      <span className="level-badge">Xem và học bộ từ →</span>
    </Link>)}</div>}
  </section>;
}
export function DeckDetails(){
  const {id}=useParams();
  const [data,setData]=useState<(Deck & {entries:Entry[]})|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(!id)return;void api<Deck&{entries:Entry[]}>("/api/v1/decks/"+id).then(setData).catch(e=>setError(e.message));},[id]);
  return <section className="content-page">
    {error?<div className="notice">{error}</div>:!data?<div className="notice">Đang tải bộ từ…</div>:<>
      <span className="eyebrow">Nihon · Bộ từ vựng</span><h1>{data.name}</h1>
      <p className="page-intro">{data.description||"Học từ vựng tiếng Nhật"}</p>
      <p><Link className="button primary" to={"/practice?deck="+id}>Học bộ từ này →</Link></p>
      <div className="vocab-grid">{data.entries.map(e=><div className="vocab-tile" key={e.id}>
        <div className="vocab-title"><strong>{e.word}</strong><span className="level-badge">{e.jlptLevel||"—"}</span></div>
        <p className="muted">{e.reading}</p>
      </div>)}</div>
    </>}
  </section>;
}
