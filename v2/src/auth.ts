import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyAdminPassword } from "@/lib/admin-password";

/** Single-admin bootstrap: no client-supplied account IDs or roles are trusted. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Nihon Admin",
      credentials: { password: { label: "Mật khẩu quản trị", type: "password" } },
      async authorize(credentials) {
        const valid = verifyAdminPassword(credentials?.password, process.env.NIHON_ADMIN_PASSWORD_HASH);
        if (!valid) return null;
        return { id: "nihon-local-admin", name: "Nihon Admin" };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/admin/login" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export async function isAdmin(): Promise<boolean> {
  if (!process.env.AUTH_SECRET || !process.env.NIHON_ADMIN_PASSWORD_HASH) return false;
  const session = await auth();
  return session?.user?.id === "nihon-local-admin";
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("UNAUTHORIZED_ADMIN_ACTION");
}
