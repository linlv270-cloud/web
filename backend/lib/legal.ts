import { all, run } from "./database";

export const TERMS_VERSION = "TDE-USER-20260905";
export const PRIVACY_VERSION = "TDE-PRIVACY-20260905";

function cleanHeader(value: string | null, length: number) {
  return String(value || "").trim().slice(0, length);
}

export function recordLegalConsent(creatorId: number, request: Request, source = "web-register") {
  const forwarded = cleanHeader(request.headers.get("x-forwarded-for"), 160).split(",")[0]?.trim() || "";
  const sourceIp = forwarded || cleanHeader(request.headers.get("x-real-ip"), 80);
  const userAgent = cleanHeader(request.headers.get("user-agent"), 500);
  run(
    `INSERT OR IGNORE INTO legal_consents
      (creator_id, terms_version, privacy_version, source, source_ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    creatorId,
    TERMS_VERSION,
    PRIVACY_VERSION,
    source.slice(0, 40),
    sourceIp,
    userAgent,
  );
}

export function legalConsentsForCreator(creatorId: number) {
  return all<{
    terms_version: string;
    privacy_version: string;
    source: string;
    agreed_at: string;
  }>(
    `SELECT terms_version, privacy_version, source, agreed_at
     FROM legal_consents WHERE creator_id = ? ORDER BY agreed_at DESC`,
    creatorId,
  ).map((row) => ({
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    source: row.source,
    agreedAt: row.agreed_at,
  }));
}

export function markCreatorSection(creatorId: number, section: string) {
  run(
    `INSERT INTO creator_section_updates(creator_id, section, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(creator_id, section) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    creatorId,
    section.slice(0, 40),
  );
}

export function creatorSectionUpdates(creatorId: number): Record<string, string> {
  return Object.fromEntries(
    all<{ section: string; updated_at: string }>(
      "SELECT section, updated_at FROM creator_section_updates WHERE creator_id = ?",
      creatorId,
    ).map((row) => [row.section, row.updated_at]),
  );
}
