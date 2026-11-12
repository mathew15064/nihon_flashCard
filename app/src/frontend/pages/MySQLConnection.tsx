import {FormEvent,useEffect,useState} from "react";
import {api,write} from "../api";

type Connection={
  host:string;port:number;database:string;user:string;
  tls:"required"|"off";passwordConfigured:boolean;
};
type Status={connected:boolean;engine:string;database:string;version:string;tls:string};
export default function MySQLConnection(){
  const [current,setCurrent]=useState<Connection|null>(null);
  const [host,setHost]=useState("");
  const [port,setPort]=useState(3306);
  const [user,setUser]=useState("");
  const [password,setPassword]=useState("");
  const [tls,setTls]=useState<"required"|"off">("required");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    void api<Connection>("/api/v1/admin/settings/mysql/connection").then(x=>{
      setCurrent(x);setHost(x.host);setPort(x.port);setUser(x.user);setTls(x.tls);
    }).catch(e=>setError(e instanceof Error?e.message:"MYSQL_LOAD_FAILED"));
  },[]);
  function connection(){
    return {host,port,user,tls,...(password?{password}:{})};
  }
  async function test(){
    setBusy(true);setMessage("");setError("");
    try{
      const status=await write<Status>("/api/v1/admin/settings/mysql/test",connection());
      if(!status.connected)throw new Error("MYSQL_CONNECTION_FAILED");
      setMessage("Kết nối thành công: "+status.version);
    }catch(e){setError(e instanceof Error?e.message:"MYSQL_CONNECTION_FAILED");}
    finally{setBusy(false);}
  }
  async function save(e:FormEvent){
    e.preventDefault();
    if(!window.confirm("Đổi kết nối MySQL đang hoạt động? Chỉ chấp nhận database có cùng định danh Admin và migrations đã áp dụng."))return;
    setBusy(true);setMessage("");setError("");
    try{
      await write("/api/v1/admin/settings/mysql/connection",connection(),"PATCH");
      setPassword("");
      setMessage("Đã cập nhật và xác minh kết nối MySQL.");
    }catch(e){setError(e instanceof Error?e.message:"MYSQL_UPDATE_FAILED");}
    finally{setBusy(false);}
  }
  if(!current)return <div className="admin-panel">
    <h2>Kết nối MySQL</h2>
    <p>{error||"Đang tải thông tin MySQL…"}</p>
  </div>;
  return <div className="admin-panel">
    <h2>Kết nối MySQL</h2>
    <p className="muted">Đang sử dụng database <strong>{current.database}</strong>. Thông tin mật khẩu được lưu mã hóa trên server và không bao giờ được gửi về trang này.</p>
    <form className="form-vertical" onSubmit={save}>
      <label>Host<input className="input-text" value={host} maxLength={253}
        required onChange={e=>setHost(e.target.value)}/></label>
      <label>Port<input className="input-text" type="number" min={1} max={65535}
        required value={port} onChange={e=>setPort(Number(e.target.value))}/></label>
      <label>Database (cố định khi đã cài đặt)
        <input className="input-text" value={current.database} readOnly/>
      </label>
      <label>Username<input className="input-text" value={user}
        required onChange={e=>setUser(e.target.value)}/></label>
      <label>Password mới (để trống để giữ mật khẩu hiện tại)
        <input className="input-text" type="password" autoComplete="new-password"
          value={password} onChange={e=>setPassword(e.target.value)}
          placeholder={current.passwordConfigured?"Đã cấu hình, không hiển thị":"Chưa đặt"}/>
      </label>
      <label>TLS
        <select className="select-input" value={tls}
          onChange={e=>setTls(e.target.value as "required"|"off")}>
          <option value="required">Bắt buộc TLS và kiểm tra chứng chỉ</option>
          <option value="off">Không TLS (chỉ mạng nội bộ tin cậy)</option>
        </select>
      </label>
      {message?<p role="status" className="notice">{message}</p>:null}
      {error?<p role="alert" className="form-error">{error}</p>:null}
      <div className="candidate-actions">
        <button type="button" className="button outline" disabled={busy}
          onClick={()=>void test()}>Kiểm tra kết nối</button>
        <button className="button primary" type="submit" disabled={busy}>
          {busy?"Đang xác minh…":"Lưu kết nối"}
        </button>
      </div>
    </form>
    <p className="muted">Đổi sang một MySQL database khác không được hỗ trợ trực tiếp; cần backup, đối soát và quy trình cutover để tránh mất tiến độ học.</p>
  </div>;
}
