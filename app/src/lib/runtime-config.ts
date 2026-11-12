import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
/** Encryption only. All application settings are stored in MySQL app_settings. */
function encryptionKey():Buffer {
  const secret=process.env.AUTH_SECRET;
  if(!secret || secret.length<32)throw new Error("INSTANCE_SECRET_UNAVAILABLE");
  return Buffer.from(hkdfSync("sha256",Buffer.from(secret),"nihon-settings-v1","settings-at-rest",32));
}
export function encryptValue(plaintext:string):string {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const output=Buffer.concat([cipher.update(plaintext,"utf8"),cipher.final()]);
  return ["enc1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),
    output.toString("base64url")].join(".");
}
export function decryptValue(value:string):string {
  const parts=value.split(".");
  if(parts.length!==4 || parts[0]!=="enc1")throw new Error("SETTINGS_CIPHERTEXT_INVALID");
  try {
    const iv=Buffer.from(parts[1]!,"base64url");
    const tag=Buffer.from(parts[2]!,"base64url");
    if(iv.length!==12 || tag.length!==16)throw new Error("SETTINGS_CIPHERTEXT_INVALID");
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!,"base64url")),decipher.final()]).toString("utf8");
  }catch{throw new Error("SETTINGS_DECRYPT_FAILED");}
}
/** Legacy environment-only fallback used by isolated provider tests, never in MySQL Settings. */
export function aiModel():string {
  return process.env.NIHON_AI_MODEL?.trim() || "gpt-4.1-mini";
}
export function openaiKey():string|undefined {
  return process.env.OPENAI_API_KEY?.trim();
}
