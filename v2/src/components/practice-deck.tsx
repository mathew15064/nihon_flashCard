"use client";
import { useEffect, useState } from "react";
type Card = {id:string; word:string; reading:string; senses:{language:string;meaning:string}[]};
export default function PracticeDeck() {
  const [cards,setCards]=useState<Card[]>([]);
  const [index,setIndex]=useState(0);
  const [revealed,setRevealed]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    fetch("/api/v1/vocabulary?limit=30")
      .then(r=>r.json()).then(j=>{if(!j.success) throw new Error("API_ERROR");setCards(j.data.items);})
      .catch(()=>setError("Không tải được từ vựng. Hãy kiểm tra database."));
  },[]);
  const card=cards[index];
  return <div className="practice-area">
    {error?<p role="alert">{error}</p>:!card?<div className="notice">Chưa có từ vựng đã xuất bản để luyện tập.</div>:<>
      <div className="practice-progress">Thẻ {index+1} / {cards.length}</div>
      <button className="practice-card" onClick={()=>setRevealed(v=>!v)} aria-label={revealed?"Ẩn đáp án":"Lật thẻ xem đáp án"}>
        <span className="eyebrow">{revealed?"Đáp án":"Bạn có nhớ nghĩa từ này?"}</span>
        <strong>{card.word}</strong>
        {revealed?<><span>{card.reading}</span><span className="card-answer">{card.senses.find(s=>s.language==="vi")?.meaning??"—"}</span></>:<span className="flip-hint">Chạm để lật thẻ ↻</span>}
      </button>
      <div className="practice-controls">
        <button className="button outline" onClick={()=>{setIndex(i=>(i-1+cards.length)%cards.length);setRevealed(false);}}>← Trước</button>
        <button className="button primary" onClick={()=>{setIndex(i=>(i+1)%cards.length);setRevealed(false);}}>Tiếp theo →</button>
      </div>
    </>}
  </div>;
}
