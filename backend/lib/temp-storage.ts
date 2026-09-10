import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TEMP_DIR_NAME = "temp-downloads";
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 小时过期

function getTempDir(): string {
  const base = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  const dir = path.join(base, TEMP_DIR_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface TempFileMeta {
  token: string;
  originalName: string;
  createdAt: number;
  expiresAt: number;
  size: number;
}

/** 生成安全的随机 token */
export function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** 保存临时文件，返回元信息（含 token） */
export async function saveTempFile(
  buffer: Buffer,
  originalName: string,
): Promise<TempFileMeta> {
  const dir = getTempDir();
  const token = generateToken();
  const filePath = path.join(dir, `${token}.zip`);
  const metaPath = path.join(dir, `${token}.json`);

  await fs.promises.writeFile(filePath, buffer);

  const now = Date.now();
  const meta: TempFileMeta = {
    token,
    originalName,
    createdAt: now,
    expiresAt: now + EXPIRE_MS,
    size: buffer.length,
  };

  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2));

  // 顺手清理过期文件
  cleanupExpired();

  return meta;
}

/** 获取临时文件（校验是否过期），过期返回 null */
export async function getTempFile(
  token: string,
): Promise<{ buffer: Buffer; meta: TempFileMeta } | null> {
  const dir = getTempDir();
  const filePath = path.join(dir, `${token}.zip`);
  const metaPath = path.join(dir, `${token}.json`);

  if (!fs.existsSync(filePath) || !fs.existsSync(metaPath)) return null;

  let meta: TempFileMeta;
  try {
    meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
  } catch {
    return null;
  }

  if (Date.now() > meta.expiresAt) {
    await deleteTempFile(token);
    return null;
  }

  const buffer = await fs.promises.readFile(filePath);
  return { buffer, meta };
}

/** 删除临时文件 */
export async function deleteTempFile(token: string): Promise<void> {
  const dir = getTempDir();
  try { await fs.promises.unlink(path.join(dir, `${token}.zip`)); } catch { /* ignore */ }
  try { await fs.promises.unlink(path.join(dir, `${token}.json`)); } catch { /* ignore */ }
}

/** 清理所有过期文件（同步，适合在请求中顺手调用） */
export function cleanupExpired(): void {
  const dir = getTempDir();
  const now = Date.now();
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const meta: TempFileMeta = JSON.parse(
          fs.readFileSync(path.join(dir, file), "utf-8"),
        );
        if (now > meta.expiresAt) {
          fs.unlinkSync(path.join(dir, `${meta.token}.zip`));
          fs.unlinkSync(path.join(dir, `${meta.token}.json`));
        }
      } catch { /* ignore broken meta */ }
    }
  } catch { /* ignore */ }
}
