"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export type LoginState = { error: string };

export async function loginAdmin(_state: LoginState, data: FormData): Promise<LoginState> {
  const password = data.get("password");
  if (typeof password !== "string" || password.length > 256 || !password) {
    return { error: "Vui lòng nhập mật khẩu quản trị." };
  }
  try {
    await signIn("credentials", { password, redirectTo: "/admin" });
    return { error: "" };
  } catch (error) {
    if (error instanceof AuthError) return { error: "Mật khẩu không đúng hoặc tài khoản chưa được cấu hình." };
    throw error;
  }
}
