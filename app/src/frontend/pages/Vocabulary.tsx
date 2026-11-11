import {useEffect,useState} from "react";
import {api} from "../api";

type Entry={id:string;word:string;reading:string;romanization:string|null;jlptLevel:string|null;
  senses:{language:string;meaning:string}[]};
export default function Vocabulary(){
  const [search,setSearch]=useState(""),[level,setLevel]=useState("");
  const [items,setItems]=useState<Entry[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      setLoading(true);
      try{
        const params=new URLSearchParams({limit:"100"});
        if(search.trim())params.set("search",search.trim());
        if(level)params.set("jlpt",level);
        const data=await api<{items:Entry[]}>("/api/v1/vocabulary?"+params);
        if(active){setItems(data.items);setError("");}
      }catch(error){if(active)setError(error instanceof Error?error.message:"Không tải được kho từ");}
      finally{if(active)setLoading(false);}
    },180);
    return()=>{active=false;clearTimeout(timer);};
  },[search,level]);
  return <section className="content-page">
    <span className="eyebrow">日本語辞書 · Japanese Vocabulary</span>
    <h1>Kho từ vựng</h1>
    <p className="page-intro">Tra cứu những từ tiếng Nhật đã được Admin xuất bản.</p>
    <div className="filters">
      <label className="search-box"><span>⌕</span><input aria-label="Tìm từ" value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Tìm chữ Nhật hoặc cách đọc…" maxLength={80}/></label>
      <select aria-label="Cấp JLPT" value={level} onChange={e=>setLevel(e.target.value)}>
        <option value="">Tất cả cấp độ</option>
        {["N5","N4","N3","N2","N1"].map(v=><option value={v} key={v}>{v}</option>)}
      </select>
    </div>
    {loading?<p className="muted" role="status">Đang tải từ…</p>:error?<div className="notice form-error">{error}</div>
      :items.length===0?<div className="notice">Không tìm thấy từ phù hợp.</div>
      :<div className="vocab-grid">{items.map(item=><article className="vocab-tile" key={item.id}>
        <div className="vocab-title"><strong>{item.word}</strong><span className="level-badge">{item.jlptLevel||"—"}</span></div>
        <p className="muted">{item.reading}{item.romanization?" · "+item.romanization:""}</p>
        <div className="tile-rule"/>
        <p>{item.senses.find(s=>s.language==="vi")?.meaning||item.senses[0]?.meaning||"—"}</p>
      </article>)}</div>}
  </section>;
}
