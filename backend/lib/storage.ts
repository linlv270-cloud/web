import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function root() {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  return path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data"), "uploads");
}

function resolveKey(key: string) {
  const parts = key.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) throw new Error("Invalid key");
  const filename = path.resolve(root(), ...parts);
  if (!filename.startsWith(`${root()}${path.sep}`)) throw new Error("Invalid key");
  return filename;
}

export async function putObject(key: string, body: Buffer) {
  const filename = resolveKey(key);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, body);
}

export async function getObject(key: string) {
  try {
    const filename = resolveKey(key);
    const [body, info] = await Promise.all([readFile(filename), stat(filename)]);
    const contentType = key.endsWith(".png") ? "image/png"
      : key.endsWith(".webp") ? "image/webp"
      : key.endsWith(".avif") ? "image/avif"
      : key.endsWith(".heic") ? "image/heic"
      : key.endsWith(".heif") ? "image/heif"
      : "image/jpeg";
    return { body, etag: `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`, contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteObject(key: string) {
  await rm(resolveKey(key), { force: true });
}

export function assetUrl(key: string | null) {
  return key ? `/api/assets/${key.split("/").map(encodeURIComponent).join("/")}` : null;
}
