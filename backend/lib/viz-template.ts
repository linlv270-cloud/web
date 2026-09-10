import { getDb } from "./database";

export interface VizTemplateConfig {
  brandName: string;
  brandSubtitle: string;
  footerText: string;
  qrCodeImageUrl: string | null;
  autoYear: boolean;
}

const DEFAULT_CONFIG: VizTemplateConfig = {
  brandName: "TDECOCOC",
  brandSubtitle: "用户档案",
  footerText: "TDE原创者社区",
  qrCodeImageUrl: null,
  autoYear: true,
};

const CONFIG_KEY = "viz_template_config";

export function getVizTemplateConfig(): VizTemplateConfig {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM platform_settings WHERE key = ?")
      .get(CONFIG_KEY) as { value: string } | undefined;
    if (!row) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function updateVizTemplateConfig(input: Partial<VizTemplateConfig>): VizTemplateConfig {
  const current = getVizTemplateConfig();
  const updated = { ...current, ...input };
  const db = getDb();

  db.prepare(
    `INSERT INTO platform_settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(CONFIG_KEY, JSON.stringify(updated));

  return updated;
}

export function resolveTemplateSubtitle(config: VizTemplateConfig): string {
  if (config.autoYear) {
    const year = new Date().getFullYear();
    return `${config.brandSubtitle} · ${year}`;
  }
  return config.brandSubtitle;
}
