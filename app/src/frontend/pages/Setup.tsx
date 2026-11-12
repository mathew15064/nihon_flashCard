import { FormEvent,useState } from "react";
import { write } from "../api";

type SetupResult={installed:boolean;database:string};
export default function Setup({onComplete}:{onComplete:()=>Promise<void>}) {
  const [database,setDatabase]=useState<"sqlite"|"mysql">("sqlite");
  const [setupCode,setSetupCode]=useState("");
  const [adminPassword,setAdminPassword]=useState("");
  const [repeatPassword,setRepeatPassword]=useState("");
  const [enableSignup,setEnableSignup]=useState(false);
  const [origin,setOrigin]=useState(window.location.origin);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setError("");setBusy(true);
    try{
      if(database!=="sqlite")throw new Error("MYSQL_ADAPTER_NOT_READY");
      const result=await write<SetupResult>("/api/v1/setup/initialize",{
        setupCode,database,adminPassword,repeatPassword,origin,enableSignup,
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
    <p className="page-intro">Chỉ cần thực hiện một lần. Nihon đã tự tạo secret và database SQLite trên ổ lưu trữ riêng; không cần sửa source hay .env.</p>
    <div className="admin-panel">
      <h2>1. Chọn cơ sở dữ liệu</h2>
      <div className="form-vertical">
        <label><input type="radio" checked={database==="sqlite"} onChange={()=>setDatabase("sqlite")}/> SQLite + Drizzle — đã hỗ trợ, chạy tự động không cần mật khẩu DB</label>
        <label><input type="radio" checked={database==="mysql"} onChange={()=>setDatabase("mysql")}/> MySQL — chưa hỗ trợ trong bản hiện tại</label>
        {database==="mysql"?<div className="notice" role="status">MySQL cần adapter Drizzle và migration riêng. Không thể chọn để lưu dữ liệu trước khi phần này được kiểm thử. Hãy chọn SQLite để sử dụng ngay.</div>:null}
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
        <button className="button primary" type="submit" disabled={busy||database!=="sqlite"}>
          {busy?"Đang khởi tạo…":"Hoàn tất cài đặt"}
        </button>
      </form>
    </div>
    <p className="muted">Sau khi hoàn tất, đăng nhập Admin và vào Settings để lưu API key, cấu hình AI và tạo token MCP. Không trả mã bí mật qua các API công khai.</p>
  </section>;
}
