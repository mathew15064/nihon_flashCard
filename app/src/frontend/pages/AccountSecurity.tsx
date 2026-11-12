import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { write } from "../api";

type ChangeResult = { passwordChanged: boolean; otherSessionsRevoked: boolean };

/** Requires a logged-in learner (route guarded in App). */
export default function AccountSecurity() {
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [repeatPassword,setRepeatPassword]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState(false);
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy)return;
    setError("");setSuccess(false);setBusy(true);
    try {
      const result=await write<ChangeResult>("/api/v1/auth/learner/password",{
        currentPassword,newPassword,repeatPassword,
      });
      if(!result.passwordChanged || !result.otherSessionsRevoked)
        throw new Error("PASSWORD_CHANGE_NOT_CONFIRMED");
      setCurrentPassword("");setNewPassword("");setRepeatPassword("");
      setSuccess(true);
    }catch(err){
      const message=err instanceof Error?err.message:"";
      setError(message==="INVALID_CREDENTIALS"
        ?"Mật khẩu hiện tại không đúng hoặc tài khoản đang bị khóa tạm thời."
        :message==="PASSWORD_REUSE_NOT_ALLOWED"
          ?"Mật khẩu mới phải khác mật khẩu hiện tại."
          :message==="VALIDATION_ERROR"
            ?"Mật khẩu mới cần ít nhất 12 ký tự và xác nhận phải khớp."
            :"Chưa thể đổi mật khẩu. Hãy thử lại hoặc đăng nhập lại.");
    }finally{setBusy(false);}
  }
  return <section className="content-page auth-container">
    <span className="eyebrow">Nihon Account</span>
    <h1>Bảo mật tài khoản</h1>
    <p>Đổi mật khẩu sẽ đăng xuất những thiết bị khác. Phiên trên thiết bị này được cấp lại an toàn.</p>
    <div className="admin-panel">
      <form className="form-vertical" onSubmit={submit}>
        <label>Mật khẩu hiện tại
          <input className="input-text" type="password" autoComplete="current-password"
            required maxLength={256} value={currentPassword}
            onChange={e=>setCurrentPassword(e.target.value)}/>
        </label>
        <label>Mật khẩu mới
          <input className="input-text" type="password" autoComplete="new-password"
            minLength={12} maxLength={256} required value={newPassword}
            onChange={e=>setNewPassword(e.target.value)}/>
        </label>
        <label>Xác nhận mật khẩu mới
          <input className="input-text" type="password" autoComplete="new-password"
            minLength={12} maxLength={256} required value={repeatPassword}
            onChange={e=>setRepeatPassword(e.target.value)}/>
        </label>
        {error?<p className="form-error" role="alert">{error}</p>:null}
        {success?<p className="notice" role="status">Đã đổi mật khẩu. Các phiên đăng nhập cũ đã bị thu hồi.</p>:null}
        <button className="button primary" type="submit" disabled={busy}>
          {busy?"Đang cập nhật…":"Đổi mật khẩu"}
        </button>
      </form>
    </div>
    <p><Link to="/practice">Quay lại ôn tập</Link></p>
  </section>;
}
