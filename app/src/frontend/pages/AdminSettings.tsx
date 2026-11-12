import { FormEvent,useCallback,useEffect,useState } from "react";
import { Link } from "react-router-dom";
import { api,write } from "../api";

type Settings={
  database:string;mysqlAvailable:boolean;origin:string;enableSignup:boolean;
  aiModel:string;aiDailyLimit:number;openaiConfigured:boolean;
  mcpReadConfigured:boolean;mcpWriteConfigured:boolean;restConfigured:boolean;
  envFallback:{openai:boolean;mcpRead:boolean;mcpWrite:boolean};
};
type Scope="read"|"write"|"rest";
export default function AdminSettings(){
  const [settings,setSettings]=useState<Settings|null>(null);
  const [origin,setOrigin]=useState("");
  const [enableSignup,setEnableSignup]=useState(false);
  const [aiModel,setAiModel]=useState("gpt-4.1-mini");
  const [aiDailyLimit,setAiDailyLimit]=useState(10);
  const [openaiApiKey,setOpenaiApiKey]=useState("");
  const [issued,setIssued]=useState<{scope:Scope;token:string}|null>(null);
  const [message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const data=await api<Settings>("/api/v1/admin/settings");
    setSettings(data);setOrigin(data.origin);setEnableSignup(data.enableSignup);
    setAiModel(data.aiModel);setAiDailyLimit(data.aiDailyLimit);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      await write("/api/v1/admin/settings",{
        origin,enableSignup,aiModel,aiDailyLimit,
        ...(openaiApiKey?{openaiApiKey}:{}),
      },"PATCH");
      setOpenaiApiKey("");await load();setMessage("Đã lưu cấu hình trên server.");
    }catch(e){setError(e instanceof Error?e.message:"Không lưu được cấu hình.");}
    finally{setBusy(false);}
  }
  async function rotate(scope:Scope){
    if(!window.confirm("Thay token "+scope+"? Kết nối dùng token cũ sẽ bị ngắt."))return;
    setBusy(true);setError("");setIssued(null);
    try{
      const result=await write<{token:string}>("/api/v1/admin/settings/tokens/"+scope,{});
      setIssued({scope,token:result.token});await load();
    }catch(e){setError(e instanceof Error?e.message:"Không tạo được token");}
    finally{setBusy(false);}
  }
  async function revoke(scope:Scope){
    if(!window.confirm("Thu hồi token "+scope+"?"))return;
    setBusy(true);setError("");setIssued(null);
    try{
      await api("/api/v1/admin/settings/tokens/"+scope,{method:"DELETE"});
      await load();setMessage("Đã thu hồi token "+scope+".");
    }catch(e){setError(e instanceof Error?e.message:"Không thu hồi được token.");}
    finally{setBusy(false);}
  }
  async function removeKey(){
    if(!window.confirm("Xóa API key đã lưu trong Nihon?"))return;
    setBusy(true);setError("");
    try{await api("/api/v1/admin/settings/openai",{method:"DELETE"});
      await load();setMessage("Đã xóa API key lưu trong Nihon.");}
    catch(e){setError(e instanceof Error?e.message:"Không thể xóa.");}
    finally{setBusy(false);}
  }
  return <section className="content-page">
    <span className="eyebrow">Nihon Admin · Settings</span><h1>Cài đặt hệ thống</h1>
    <nav className="nav-sub"><Link to="/admin">← Quản trị nội dung</Link><Link to="/admin/ai-studio">AI Studio</Link></nav>
    <p className="page-intro">Các thay đổi được lưu trên server. API key và token được mã hóa, không xuất hiện lại trong màn hình sau khi lưu.</p>
    {error?<div className="notice form-error" role="alert">{error}</div>:null}
    {message?<div className="notice" role="status">{message}</div>:null}
    {!settings?<div className="notice">Đang tải cấu hình…</div>:<>
      <div className="admin-panel">
        <h2>Cơ sở dữ liệu</h2>
        <p><strong>SQLite + Drizzle</strong> · Đang hoạt động</p>
        <p className="muted">MySQL: chưa có adapter/migration. Không cho đổi trực tiếp DB đang chứa dữ liệu. Chuyển đổi DB sẽ cần quy trình backup, import, đối soát và cutover riêng.</p>
      </div>
      <div className="admin-panel">
        <h2>Website & AI Provider</h2>
        <form className="form-vertical" onSubmit={save}>
          <label>Địa chỉ website (Origin)
            <input className="input-text" type="url" required value={origin} onChange={e=>setOrigin(e.target.value)}/>
          </label>
          <label><input type="checkbox" checked={enableSignup} onChange={e=>setEnableSignup(e.target.checked)}/> Cho phép người học đăng ký</label>
          <label>OpenAI API key — {settings.openaiConfigured?"Đã cấu hình":"Chưa cấu hình"}
            <input className="input-text" type="password" autoComplete="off"
              placeholder="Để trống nếu không đổi key" value={openaiApiKey}
              onChange={e=>setOpenaiApiKey(e.target.value)}/>
          </label>
          <label>Model
            <input className="input-text" required maxLength={100} value={aiModel}
              onChange={e=>setAiModel(e.target.value)}/>
          </label>
          <label>Giới hạn lượt AI / 24 giờ
            <input className="input-text" type="number" min={1} max={100}
              value={aiDailyLimit} onChange={e=>setAiDailyLimit(Number(e.target.value))}/>
          </label>
          {settings.envFallback.openai?<p className="muted">Key hiện được nạp từ cấu hình hệ thống cũ; lưu key mới tại đây để ưu tiên giá trị trên giao diện.</p>:null}
          <button className="button primary" type="submit" disabled={busy}>{busy?"Đang lưu…":"Lưu cấu hình"}</button>
          {settings.openaiConfigured?<button className="button outline" type="button" onClick={()=>void removeKey()} disabled={busy}>Xóa key đã lưu</button>:null}
        </form>
      </div>
      <div className="admin-panel">
        <h2>MCP & API integration</h2>
        <p>Endpoint MCP: <code>{window.location.origin}/mcp</code></p>
        <p className="muted">Hai token MCP có quyền riêng: read (tra cứu) và write (tra cứu + tạo nháp). Token REST Admin dùng cho tích hợp tin cậy. Không chia sẻ token write/REST ra trình duyệt công cộng.</p>
        {(["read","write","rest"] as const).map(scope=><div key={scope} className="review-row">
          <div className="review-description"><strong>{scope==="read"?"MCP Read":scope==="write"?"MCP Draft Writer":"Admin REST"}</strong>
            <p className="muted">{scope==="read"?(settings.mcpReadConfigured?"Đã cấp token":"Chưa cấu hình"):scope==="write"?(settings.mcpWriteConfigured?"Đã cấp token":"Chưa cấu hình"):(settings.restConfigured?"Đã cấp token":"Chưa cấu hình")}</p>
          </div>
          <div className="candidate-actions">
            <button className="button primary" type="button" onClick={()=>void rotate(scope)} disabled={busy}>Tạo / xoay token</button>
            <button className="button outline" type="button" onClick={()=>void revoke(scope)} disabled={busy}>Thu hồi</button>
          </div>
        </div>)}
        {issued?<div className="notice" role="status">
          <strong>Token {issued.scope} — chỉ hiển thị lần này</strong>
          <p><input className="input-text" readOnly type="text" value={issued.token} aria-label="Token mới cấp"/></p>
          <button className="button outline" type="button" onClick={()=>void navigator.clipboard.writeText(issued.token)}>Sao chép token</button>
          <button className="button outline" type="button" onClick={()=>setIssued(null)}>Đóng, không hiển thị lại</button>
        </div>:null}
        <p className="muted">MCP public OAuth vẫn chưa triển khai. Kết nối MCP từ các AI client tin cậy hiện dùng URL và Bearer token do Admin cấp.</p>
      </div>
    </>}
  </section>;
}
