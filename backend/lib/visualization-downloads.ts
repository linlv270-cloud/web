import JSZip from "jszip";
import { all, run } from "./database";
import { getCreator } from "./repository";
import type { VisualizationUser } from "./types";

export type VisualizationDownloadType = "inspiration" | "creator_filter";

export type DownloadCreatorSnapshot = {
  id: number;
  name: string;
  brand: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  tags: string[];
};

export type VisualizationDownloadRecord = {
  id: number;
  vizUserId: number | null;
  vizUserName: string;
  vizUserPhone: string;
  downloadType: VisualizationDownloadType;
  fileName: string;
  planId: number | null;
  creators: DownloadCreatorSnapshot[];
  createdAt: string;
};

function parseSnapshots(value: string): DownloadCreatorSnapshot[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createVisualizationDownload(
  user: VisualizationUser,
  input: { downloadType: VisualizationDownloadType; creatorIds?: unknown[]; fileName?: string; planId?: number | null },
) {
  if (!(["inspiration", "creator_filter"] as string[]).includes(input.downloadType)) throw new Error("下载类型不正确");
  const creatorIds = [...new Set((input.creatorIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  const creators = creatorIds.flatMap((id): DownloadCreatorSnapshot[] => {
    const creator = getCreator(id);
    if (!creator || creator.suspended) return [];
    if (user.accessScope === "province" && creator.province !== user.province) {
      throw new Error("主理人不在账号授权范围内");
    }
    if (
      user.accessScope === "city" &&
      (creator.province !== user.province || creator.city !== user.city)
    ) {
      throw new Error("主理人不在账号授权范围内");
    }
    return [{
      id: creator.id,
      name: creator.userName || "",
      brand: creator.brandName || "",
      phone: creator.phone || "",
      province: creator.province || "",
      city: creator.city || "",
      district: creator.district || "",
      tags: creator.tags.filter((tag) => tag.status === "active").map((tag) => tag.label),
    }];
  });
  const result = run(
    `INSERT INTO visualization_downloads
      (viz_user_id, viz_user_name, viz_user_phone, download_type, file_name, plan_id, creator_snapshots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    user.name,
    user.phone,
    input.downloadType,
    String(input.fileName || "").slice(0, 180),
    input.planId ? Number(input.planId) : null,
    JSON.stringify(creators),
  );
  return Number(result.lastInsertRowid);
}

export function listVisualizationDownloads(limit = 500): VisualizationDownloadRecord[] {
  return all<{
    id: number; viz_user_id: number | null; viz_user_name: string; viz_user_phone: string;
    download_type: VisualizationDownloadType; file_name: string; plan_id: number | null;
    creator_snapshots: string; created_at: string;
  }>("SELECT * FROM visualization_downloads ORDER BY created_at DESC, id DESC LIMIT ?", Math.max(1, Math.min(limit, 5000)))
    .map((row) => ({
      id: row.id,
      vizUserId: row.viz_user_id,
      vizUserName: row.viz_user_name,
      vizUserPhone: row.viz_user_phone,
      downloadType: row.download_type,
      fileName: row.file_name,
      planId: row.plan_id,
      creators: parseSnapshots(row.creator_snapshots),
      createdAt: row.created_at,
    }));
}

function xml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export async function buildVisualizationDownloadsXlsx(records: VisualizationDownloadRecord[]) {
  const headers = ["下载编号", "下载人", "下载人手机号", "下载时间", "下载方式", "文件名", "主理人姓名", "品牌", "主理人手机号", "省", "市", "区/县", "标签"];
  const rows = records.flatMap((record) => {
    const creators = record.creators.length ? record.creators : [null];
    return creators.map((creator) => [
      record.id, record.vizUserName, record.vizUserPhone, record.createdAt,
      record.downloadType === "inspiration" ? "灵感日历" : "主理人筛选", record.fileName,
      creator?.name || "", creator?.brand || "", creator?.phone || "", creator?.province || "",
      creator?.city || "", creator?.district || "", creator?.tags.join("、") || "",
    ]);
  });
  const sheetRows = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const column = String.fromCharCode(65 + columnIndex);
    return `<c r="${column}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="下载记录" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="13" width="18" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:M${rows.length + 1}"/></worksheet>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
