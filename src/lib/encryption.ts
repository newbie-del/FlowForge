import Cryptr from "cryptr";

const encryptionKey = process.env.ENCRYPTION_KEY;

if (!encryptionKey) {
  throw new Error("ENCRYPTION_KEY is required");
}

const cryptr = new Cryptr(encryptionKey);

export const encrypt = (text: string) => cryptr.encrypt(text);
export const decrypt = (text: string) => cryptr.decrypt(text);
