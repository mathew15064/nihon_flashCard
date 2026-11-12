import { FormEvent,useState } from "react";
import { write } from "../api";

type SetupResult={installed:boolean;database:string};
export default function Setup({onComplete}:{onComplete:()=>Promise<void>}) {
  const [setupCode,setSetupCode]=useState("");
  const [adminPassword,setAdminPassword]=useState("");
  const [repeatPassword,setRepeatPassword]=useState("");
  const [enableSignup,setEnableSignup]=useState(false);
  const [origin,setOrigin]=useState(window.location.origin);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [mysqlHost,setMysqlHost]=useState("localhost");
  const [mysqlPort,setMysqlPort]=useState(3306);
  const [mysqlDatabase,setMysqlDatabase]=useState("nihon");
  const [mysqlUser,setMysqlUser]=useState("nihon");
  const [mysqlPassword,setMysqlPassword]=useState("");
  const [mysqlTls,setMysqlTls]=useState<"required"|"off">("required");
  const [mysqlMessage,setMysqlMessage]=useState("");
  async function checkMysqlConnection(){
    setError("");setMysqlMessage("");setBusy(true);
    try{
      const result=await write<{connected:boolean;version:string;database:string}>(
        "/api/v1/setup/mysql/test",{
          setupCode,origin,
          connection:{
            host:mysqlHost,port:mysqlPort,database:mysqlDatabase,
            user:mysqlUser,password:mysqlPassword,tls:mysqlTls,
          },
        });
      if(!result.connected)throw new Error("MYSQL_CONNECTION_FAILED");
      setMysqlMessage("Kết nối MySQL đã xác minh: "+result.version+
        " · database "+result.database);
    }catch(e){
      setError(e instanceof Error?e.message:"MYSQL_CONNECTION_FAILED");
    }finally{setBusy(false);}
  }
  async function submit(e:FormEvent){
    e.preventDefault();setError("");setBusy(true);
    try{
      const result=await write<SetupResult>("/api/v1/setup/initialize",{
        setupCode,database:"mysql",adminPassword,repeatPassword,origin,enableSignup,
        mysql:{host:mysqlHost,port:mysqlPort,database:mysqlDatabase,
          user:mysqlUser,password:mysqlPassword,tls:mysqlTls},
      });
      if(!result.installed)throw new Error("INSTALL_FAILED");
      setSetupCode("");setAdminPassword("");setRepeatPassword("");
      await onComplete();
    }catch(e){setError(e instanceof Error?e.message:"Không thể cài đặt.");}
    finally{setBusy(false);}
  }
  return <section className="content-page auth-container">
    <span className="eyebrow">First-run setup · Nihon</span>
    <h1>Khởi tạo hệ thống</h1>
    <p className="page-intro">Chỉ cần thực hiện một lần. Nihon tự tạo secret bảo mật và kho cấu hình khởi tạo. Kết nối MySQL để lưu toàn bộ dữ liệu ứng dụng; không cần sửa source hay .env.</p>
    <div className="admin-panel">
      <h2>1. Kết nối MySQL</h2>
      <div className="form-vertical">
        <div className="admin-panel" role="group" aria-label="MySQL connection">
          <h3>Kết nối MySQL</h3>
          <p className="muted">Kết nối tới database MySQL trống, kiểm tra quyền và tự chạy migrations trước khi tạo Admin. Không thay thế dữ liệu cũ.</p>
          <label>MySQL host<input className="input-text" value={mysqlHost} onChange={e=>setMysqlHost(e.target.value)} autoComplete="off"/></label>
          <label>Port<input className="input-text" type="number" min={1} max={65535} value={mysqlPort} onChange={e=>setMysqlPort(Number(e.target.value))}/></label>
          <label>Tên database<input className="input-text" value={mysqlDatabase} onChange={e=>setMysqlDatabase(e.target.value)}/></label>
          <label>Username<input className="input-text" value={mysqlUser} onChange={e=>setMysqlUser(e.target.value)} autoComplete="username"/></label>
          <label>Password<input className="input-text" type="password" value={mysqlPassword} onChange={e=>setMysqlPassword(e.target.value)} autoComplete="off"/></label>
          <label>Kết nối TLS
            <select className="select-input" value={mysqlTls} onChange={e=>setMysqlTls(e.target.value as "required"|"off")}>
              <option value="required">Bắt buộc TLS, kiểm tra chứng chỉ (khuyến nghị)</option>
              <option value="off">Không TLS — chỉ dùng MySQL trong mạng QA tin cậy</option>
            </select>
          </label>
          <button type="button" className="button outline" disabled={busy||!setupCode}
            onClick={()=>void checkMysqlConnection()}>Kiểm tra kết nối MySQL</button>
          {mysqlMessage?<p role="status" className="notice">{mysqlMessage}</p>:null}
          <p className="muted">Nhập mã khởi tạo ở phần dưới trước khi nhấn kiểm tra kết nối.</p>
        </div>
      </div>
    </div>
    <div className="admin-panel">
      <h2>2. Tạo quản trị viên</h2>
      <form className="form-vertical" onSubmit={submit}>
        <label>Mã khởi tạo một lần
          <input className="input-text" autoComplete="off" value={setupCode}
            onChange={e=>setSetupCode(e.target.value)} required maxLength={100}/>
        </label>
        <p className="muted">Mã chỉ hiện trong log/console của server khi khởi động lần đầu. Điều này ngăn người lạ tạo Admin trước bạn.</p>
        <label>Mật khẩu Admin
          <input className="input-text" type="password" autoComplete="new-password"
            minLength={12} maxLength={256} required value={adminPassword}
            onChange={e=>setAdminPassword(e.target.value)}/>
        </label>
        <label>Xác nhận mật khẩu
          <input className="input-text" type="password" autoComplete="new-password"
            minLength={12} maxLength={256} required value={repeatPassword}
            onChange={e=>setRepeatPassword(e.target.value)}/>
        </label>
        <label>Địa chỉ website (Origin)
          <input className="input-text" type="url" required value={origin}
            onChange={e=>setOrigin(e.target.value)}/>
        </label>
        <label><input type="checkbox" checked={enableSignup} onChange={e=>setEnableSignup(e.target.checked)}/>
          Cho phép người học tự đăng ký
        </label>
        {error?<p className="form-error" role="alert">{error}</p>:null}
        <button className="button primary" type="submit" disabled={busy}>
          {busy?"Đang khởi tạo…":"Hoàn tất cài đặt"}
        </button>
      </form>
    </div>
    <p className="muted">Sau khi hoàn tất, đăng nhập Admin và vào Settings để lưu API key, cấu hình AI và tạo token MCP. Không trả mã bí mật qua các API công khai.</p>
  </section>;
}
