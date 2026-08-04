import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function createPasswordDigest(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
) {
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected);
}

export function validateNewPassword(password: string) {
  if (password.length < 12) return "Şifre en az 12 karakter olmalıdır.";
  if (!/[a-zçğıöşü]/.test(password)) return "Şifre küçük harf içermelidir.";
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) return "Şifre büyük harf içermelidir.";
  if (!/\d/.test(password)) return "Şifre rakam içermelidir.";
  if (!/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(password)) {
    return "Şifre özel karakter içermelidir.";
  }
  return null;
}
