import { z } from "zod";

export const usernameSchema = z.string().trim().min(3).max(50)
  .regex(/^[\p{L}\p{N}_.-]+$/u, "Chỉ dùng chữ cái, số, dấu gạch, chấm hoặc gạch dưới.");
export const passwordSchema = z.string().min(12).max(256);

export const registerInputSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  password: passwordSchema,
  repeatPassword: passwordSchema,
}).strict().refine(x => x.password === x.repeatPassword, {
  message:"Mật khẩu xác nhận không khớp.",path:["repeatPassword"],
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export function normalizeUsername(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}
