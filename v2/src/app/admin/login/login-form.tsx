"use client";

import { useActionState } from "react";
import { loginAdmin, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAdmin, { error: "" }
  );
  return (
    <form action={action} className="admin-panel admin-form">
      <label htmlFor="password">Mật khẩu quản trị</label>
      <input id="password" name="password" type="password" autoComplete="current-password"
        minLength={1} maxLength={256} required placeholder="Nhập mật khẩu Admin" />
      {state.error && <p role="alert" className="form-error">{state.error}</p>}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Đang xác thực…" : "Đăng nhập"}
      </button>
      <p className="muted">Tài khoản quản trị được cấu hình bằng biến môi trường server; không lưu mật khẩu vào trình duyệt.</p>
    </form>
  );
}
