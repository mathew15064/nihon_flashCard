import {useEffect,useState} from "react";
import {api} from "../api";

type Entry={id:string;word:string;reading:string;romanization:string|null;jlptLevel:string|null;
  senses:{language:string;meaning:string}[]};
type Page={items:Entry[];total:number;hasMore:boolean;page:number};
export default function Vocabulary(){
  const [search,setSearch]=useState(""),[level,setLevel]=useState("");
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const [items,setItems]=useState<Entry[]>([]),[total,setTotal]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      setLoading(true);
      try{
        const params=new URLSearchParams({limit:"30",page:String(page)});
        if(search.trim())params.set("search",search.trim());
        if(level)params.set("jlpt",level);
        const data=await api<Page>("/api/v1/vocabulary?"+params);
        if(active){
          setItems(previous=>{
            if(page===1)return data.items;
            const ids=new Set(previous.map(item=>item.id));
            return [...previous,...data.items.filter(item=>!ids.has(item.id))];
          });
          setTotal(data.total);setHasMore(data.hasMore);setError("");
        }
      }catch(error){if(active)setError(error instanceof Error?error.message:"Không tải được kho từ");}
      finally{if(active)setLoading(false);}
    },180);
    return()=>{active=false;clearTimeout(timer);};
  },[search,level,page,retry]);
  const changeSearch=(value:string)=>{
    setSearch(value);setPage(1);setItems([]);setTotal(0);setHasMore(false);
  };
  const changeLevel=(value:string)=>{
    setLevel(value);setPage(1);setItems([]);setTotal(0);setHasMore(false);
  };
  return <section className="content-page">
    <span className="eyebrow">日本語辞書 · Japanese Vocabulary</span>
    <h1>Kho từ vựng</h1>
    <p className="page-intro">Tra cứu những từ tiếng Nhật đã được Admin xuất bản.</p>
    <div className="filters">
      <label className="search-box"><span>⌕</span><input aria-label="Tìm từ" value={search} onChange={e=>changeSearch(e.target.value)}
        placeholder="Tìm chữ Nhật hoặc cách đọc…" maxLength={80}/></label>
      <select aria-label="Cấp JLPT" value={level} onChange={e=>changeLevel(e.target.value)}>
        <option value="">Tất cả cấp độ</option>
        {["N5","N4","N3","N2","N1"].map(v=><option value={v} key={v}>{v}</option>)}
      </select>
    </div>
    {loading&&page===1?<p className="muted" role="status">Đang tải từ…</p>:<>
      {error&&<div className="notice form-error" role="alert">Không tải được kho từ: {error}</div>}
      {!error&&items.length===0?<div className="notice">Không tìm thấy từ phù hợp.</div>:null}
      {items.length>0&&<>
        <p className="muted" role="status">Đang hiển thị {items.length} / {total} từ phù hợp.</p>
        <div className="vocab-grid">{items.map(item=><article className="vocab-tile" key={item.id}>
          <div className="vocab-title"><strong>{item.word}</strong><span className="level-badge">{item.jlptLevel||"—"}</span></div>
          <p className="muted">{item.reading}{item.romanization?" · "+item.romanization:""}</p>
          <div className="tile-rule"/>
          <p>{item.senses.find(s=>s.language==="vi")?.meaning||item.senses[0]?.meaning||"—"}</p>
        </article>)}</div>
      </>}
      {(hasMore||error)&&<button type="button" className="button outline"
        disabled={loading} onClick={()=>error?setRetry(n=>n+1):setPage(n=>n+1)}>
        {loading?"Đang tải…":error?"Thử tải lại":"Tải thêm từ"}
      </button>}
      {loading&&page>1&&<p className="muted" role="status">Đang tải thêm từ…</p>}
    </>}
  </section>;
}
