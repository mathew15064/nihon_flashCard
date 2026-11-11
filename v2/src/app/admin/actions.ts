"use server";

import { signOut } from "@/auth";

export async function logoutAdmin() {
  await signOut({ redirectTo: "/admin/login" });
}
