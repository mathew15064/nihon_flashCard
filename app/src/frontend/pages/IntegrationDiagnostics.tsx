import {useCallback,useEffect,useState} from "react";
import {api,write} from "../api";

type Diagnostics={
  database:{engine:"mysql";connected:boolean};
  ai:{provider:"openai";configured:boolean;model:string;verification:"not_checked"};
  mcp:{
    endpoint:string|null;readConfigured:boolean;writeConfigured:boolean;
    readTools:string[];writeTools:string[];bearerRequired:boolean;
    connectionVerified:false;
  };
  rest:{configured:boolean};
};
type Verification={
  verified:boolean;code:string;model:string;checkedAt:string;
  check:"model_access_only";
};
const messages:Record<string,string>={
  OK:"API key có quyền truy cập metadata của model đã chọn.",
  AI_NOT_CONFIGURED:"Chưa lưu OpenAI API key trong Settings.",
  AI_KEY_INVALID:"OpenAI từ chối API key (401).",
  AI_ACCESS_FORBIDDEN:"Tài khoản hoặc project không có quyền truy cập model (403).",
  AI_MODEL_NOT_FOUND:"Không tìm thấy model này hoặc project không được truy cập (404).",
  AI_RATE_LIMITED:"OpenAI yêu cầu giảm tần suất kiểm tra (429).",
  AI_PROVIDER_UNAVAILABLE:"OpenAI chưa phản hồi thành công.",
  AI_CONNECTION_FAILED:"Máy chủ Nihon không kết nối được tới OpenAI.",
  AI_VERIFICATION_TIMEOUT:"Hết thời gian chờ OpenAI (8 giây).",
  AI_MODEL_INVALID:"Tên model không hợp lệ.",
  AI_VERIFICATION_RESPONSE_INVALID:"OpenAI trả về metadata model không hợp lệ.",
};
export default function IntegrationDiagnostics({refreshVersion=0}:{
  refreshVersion?:number;
}){
  const [status,setStatus]=useState<Diagnostics|null>(null);
  const [verification,setVerification]=useState<Verification|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    const result=await api<Diagnostics>("/api/v1/admin/integrations/diagnostics");
    setStatus(result);
  },[]);
  useEffect(()=>{
    let active=true;
    setVerification(null);
    void api<Diagnostics>("/api/v1/admin/integrations/diagnostics").then(value=>{
      if(active)setStatus(value);
    }).catch(e=>{
      if(active)setError(e instanceof Error?e.message:"Không kiểm tra được tích hợp");
    });
    return ()=>{active=false;};
  },[refreshVersion]);
  async function refresh(){
    setBusy(true);setError("");
    try{await load();}
    catch(e){setError(e instanceof Error?e.message:"Không thể tải trạng thái");}
    finally{setBusy(false);}
  }
  async function checkOpenAI(){
    setBusy(true);setError("");setVerification(null);
    try{
      const result=await write<Verification>("/api/v1/admin/ai/verify",{});
      setVerification(result);
    }catch(e){setError(e instanceof Error?e.message:"Không thể kiểm tra OpenAI");}
    finally{setBusy(false);}
  }
  return <section className="admin-panel" aria-label="Trạng thái tích hợp">
    <h2>Kiểm tra dịch vụ và tích hợp</h2>
    <p className="muted">Thông tin cấu hình chỉ đọc từ server; API key và Bearer token không được hiển thị ở đây.</p>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    {status?<div className="form-vertical">
      <p><strong>MySQL:</strong> {status.database.connected?"Đã kết nối":"Mất kết nối"} ({status.database.engine})</p>
      <p><strong>OpenAI:</strong> {status.ai.configured?"Đã cấu hình API key":"Chưa cấu hình"} · Model: <code>{status.ai.model}</code></p>
      <p><strong>MCP:</strong> {status.mcp.endpoint?
        <code>{status.mcp.endpoint}</code>:"Chưa cấu hình website Origin"}</p>
      <p className="muted">Read: {status.mcp.readConfigured?"Có token":"Chưa cấp token"} ·
        Draft writer: {status.mcp.writeConfigured?"Có token":"Chưa cấp token"} ·
        Admin REST: {status.rest.configured?"Có token":"Chưa cấp token"}</p>
      <p className="muted">Công cụ MCP Read: <code>{status.mcp.readTools.join(", ")}</code></p>
      <p className="muted">Công cụ MCP Write: <code>{status.mcp.writeTools.join(", ")}</code></p>
      <p className="muted">Trạng thái MCP ở đây chỉ xác nhận cấu hình nội bộ;
        chưa phải xác minh kết nối từ một AI client bên ngoài.</p>
      <div className="candidate-actions">
        <button className="button outline" type="button" onClick={()=>void refresh()}
          disabled={busy}>Làm mới trạng thái</button>
        <button className="button primary" type="button" onClick={()=>void checkOpenAI()}
          disabled={busy||!status.ai.configured}>
          {busy?"Đang kiểm tra…":"Kiểm tra API key & model OpenAI"}
        </button>
      </div>
      {verification?<p className={verification.verified?"notice":"form-error"}
        role="status">
        {verification.verified?"Kiểm tra thành công. ":"Kiểm tra chưa đạt. "}
        {messages[verification.code]||"Chưa xác minh được OpenAI."}
        {" · "}{new Date(verification.checkedAt).toLocaleString("vi-VN")}
      </p>:null}
    </div>:<p className="muted" role="status">Đang tải trạng thái dịch vụ…</p>}
    <p className="muted">Kiểm tra OpenAI chỉ gọi API metadata model, không tạo nội dung,
      không gửi dữ liệu học và không xác nhận khả năng sinh câu trả lời qua Responses API.
      Hãy lưu key và model trước khi kiểm tra.</p>
  </section>;
}
