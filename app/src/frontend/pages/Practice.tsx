import {useSearchParams,Link} from "react-router-dom";
import PracticeDeck from "./PracticeDeck";
import {useAuth} from "../App";
import {useState} from "react";
import {write} from "../api";

export default function Practice(){
  const [query]=useSearchParams(),{actor}=useAuth();
  const [claimStatus,setClaimStatus]=useState("");
  const deck=query.get("deck");
  const initialDeckId=deck&&/^[0-9a-f-]{36}$/i.test(deck)?deck:null;
  async function claimGuest(){
    try{
      const result=await write<{claimed:boolean;cardsMoved:number;mergedCards:number}>("/api/v1/me/claim-guest",{});
      setClaimStatus(result.claimed?"Đã chuyển "+result.cardsMoved+" thẻ và gộp "+result.mergedCards+" thẻ.":"Đã chuyển trước đó.");
      window.location.reload();
    }catch(e){setClaimStatus(e instanceof Error?e.message:"Không thể chuyển dữ liệu khách.");}
  }
  return <section className="content-page">
    <span className="eyebrow">Flashcard · Spaced Repetition</span><h1>Ôn tập từ vựng</h1>
    <p className="page-intro">Ôn tập theo SRS: 10 phút, 1 ngày, 3 ngày, 7 ngày, 14 ngày, 30 ngày.</p>
    {actor?.role==="learner"?<div className="notice">
      Tiến độ hiện được lưu trong tài khoản <strong>{actor.name}</strong>. Nếu đã học với phiên khách,
      bạn có thể <button className="button outline" onClick={claimGuest} type="button">Chuyển tiến độ khách vào tài khoản</button>
      {claimStatus&&<p role="status">{claimStatus}</p>}
    </div>:!actor?<div className="notice">Bạn đang học ở chế độ khách bằng cookie trình duyệt.
      <Link to="/account/login"> Đăng nhập</Link> để đồng bộ tiến độ bằng tài khoản.</div>:null}
    <PracticeDeck initialDeckId={initialDeckId}/>
  </section>;
}
