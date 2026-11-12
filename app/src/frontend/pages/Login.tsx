import {FormEvent,useState} from "react";
import {Link,useNavigate} from "react-router-dom";
import {write} from "../api";
import {useAuth} from "../App";
function ErrorNote({error}:{error:string}){return error?<p className="form-error" role="alert">{error}</p>:null;}
export function AccountLogin(){
  const {refresh,actor}=useAuth(),navigate=useNavigate();
  const [username,setUsername]=useState(""),[password,setPassword]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  if(actor?.role==="learner")return <div className="content-page">Bạn đã đăng nhập. <Link to="/practice">Tiếp tục học →</Link></div>;
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");
    try{await write("/api/v1/auth/learner/login",{username,password});
      await refresh();navigate("/practice");
    }catch{setError("Tên đăng nhập hoặc mật khẩu không đúng.");}finally{setBusy(false);}
  }
  return <section className="content-page auth-container"><span className="eyebrow">Nihon Account</span><h1>Đăng nhập</h1>
    <div className="admin-panel"><form className="form-vertical" onSubmit={submit}>
      <label>Tên đăng nhập<input className="input-text" required value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label>
      <label>Mật khẩu<input className="input-text" type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      <ErrorNote error={error}/>
      <button className="button primary" type="submit" disabled={busy}>{busy?"Đang xác thực…":"Đăng nhập"}</button>
    </form><p className="muted">Chưa có tài khoản? <Link to="/account/register">Đăng ký</Link></p></div>
  </section>;
}
export function AccountRegister(){
  const {signUpEnabled}=useAuth(),navigate=useNavigate();
  const [username,setUsername]=useState(""),[displayName,setDisplayName]=useState("");
  const [password,setPassword]=useState(""),[repeatPassword,setRepeatPassword]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");
    try{
      await write("/api/v1/auth/learner/register",{username,displayName,password,repeatPassword});
      navigate("/account/login");
    }catch(err){setError(err instanceof Error?err.message:"Không thể tạo tài khoản");}
    finally{setBusy(false);}
  }
  return <section className="content-page auth-container"><span className="eyebrow">Nihon Account</span><h1>Tạo tài khoản</h1>
    {!signUpEnabled?<div className="notice">Đăng ký chưa được bật trên server. Hãy xem hướng dẫn cấu hình.</div>:
    <div className="admin-panel"><form className="form-vertical" onSubmit={submit}>
      <label>Tên đăng nhập<input className="input-text" minLength={3} maxLength={50} required value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label>Tên hiển thị<input className="input-text" minLength={1} maxLength={80} required value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
      <label>Mật khẩu<input className="input-text" type="password" minLength={12} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label>Xác nhận mật khẩu<input className="input-text" type="password" minLength={12} maxLength={256} required value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></label>
      <ErrorNote error={error}/>
      <button className="button primary" type="submit" disabled={busy}>Tạo tài khoản</button>
    </form></div>}
  </section>;
}
export function AdminLogin(){
  const {refresh,actor}=useAuth(),navigate=useNavigate();
  const [password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  if(actor?.role==="admin")return <div className="content-page">Đã đăng nhập quản trị. <Link to="/admin">Vào Admin →</Link></div>;
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");
    try{await write("/api/v1/auth/admin/login",{password});await refresh();navigate("/admin");}
    catch{setError("Không thể đăng nhập. Kiểm tra mật khẩu hoặc cấu hình server.");}
    finally{setBusy(false);}
  }
  return <section className="content-page auth-container"><span className="eyebrow">Nihon Admin</span><h1>Đăng nhập quản trị</h1>
    <div className="admin-panel"><form className="form-vertical" onSubmit={submit}>
      <label>Mật khẩu Admin<input className="input-text" required type="password" maxLength={256} autoComplete="current-password"
        value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <ErrorNote error={error}/>
      <button className="button primary" type="submit" disabled={busy}>Đăng nhập Admin</button>
    </form><p className="muted">Mật khẩu Admin chỉ được cấu hình tại server, không dùng API key của AI.</p></div>
  </section>;
}
