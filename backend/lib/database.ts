import { mkdirSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  creatorTaxonomyLegacyCategoryMap,
  legacyTaxonomyTermKey,
  projectTagSeeds,
  tagSeeds,
  themeCategories,
  themeSuggestedTags,
  designSolarTerms,
  designTagCategories,
  designTagSeeds,
  canonicalTaxonomySeeds,
} from "./catalog";

const globalDatabase = globalThis as typeof globalThis & {
  __qidengInvitationsDb?: DatabaseSync;
  __qidengTransactionSequence?: number;
};

function seedBootstrapInviteCode(db: DatabaseSync) {
  const configured = (process.env.QIDENG_BOOTSTRAP_INVITE_CODE || "").trim().toUpperCase();
  const code = configured || (process.env.NODE_ENV === "production" ? "" : "QIDENG26");
  if (!code) return;
  if (!/^[A-Z0-9]{4,8}$/.test(code))
    throw new Error("QIDENG_BOOTSTRAP_INVITE_CODE must be 4 to 8 letters or digits");

  if (db.prepare("SELECT id FROM invite_codes WHERE code = ?").get(code)) return;
  const occupied =
    db.prepare("SELECT id FROM creators WHERE invite_code = ?").get(code) ||
    db.prepare("SELECT id FROM admin_accounts WHERE invite_code = ?").get(code);
  if (occupied) throw new Error("QIDENG_BOOTSTRAP_INVITE_CODE conflicts with an existing invite code");

  db.prepare(
    "INSERT INTO invite_codes(code, source, active) VALUES (?, 'platform', 1)",
  ).run(code);
}

function seedCatalog(db: DatabaseSync) {
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO tags(label, category, status) VALUES (?, ?, 'active')",
  );
  for (const [category, labels] of Object.entries(tagSeeds)) {
    for (const label of labels) insertTag.run(label, category);
  }
  const insertProjectTag = db.prepare(
    "INSERT OR IGNORE INTO tags(label, category, status) VALUES (?, ?, 'active')",
  );
  for (const [category, labels] of Object.entries(projectTagSeeds)) {
    for (const label of labels) insertProjectTag.run(label, category);
  }

  const themeCount = Number(
    (db.prepare("SELECT COUNT(*) AS count FROM themes").get() as { count: number }).count,
  );
  if (!themeCount) {
    const insertTheme = db.prepare(
      "INSERT INTO themes(title, category, description, accent, sort_order) VALUES (?, ?, ?, ?, ?)",
    );
    const insertLink = db.prepare(
      "INSERT OR IGNORE INTO theme_tags(theme_id, tag_id) SELECT ?, id FROM tags WHERE label = ?",
    );
    let order = 1;
    for (const group of themeCategories) {
      for (const title of group.themes) {
        const result = insertTheme.run(
          title,
          group.name,
          `适合${group.name}方向的创意人与品牌参与。`,
          group.accent,
          order++,
        );
        for (const label of themeSuggestedTags[group.name] || []) {
          insertLink.run(Number(result.lastInsertRowid), label);
        }
      }
    }
  }

  seedBootstrapInviteCode(db);
}

function seedCreatorTaxonomy(db: DatabaseSync) {
  const insertCanonicalTerm = db.prepare(
    `INSERT OR IGNORE INTO taxonomy_terms(namespace, term_key, label, version, status)
     VALUES (?, ?, ?, 'v1', 'active')`,
  );
  for (const term of canonicalTaxonomySeeds)
    insertCanonicalTerm.run(term.namespace, term.termKey, term.label);

  const legacyCategories = Object.keys(creatorTaxonomyLegacyCategoryMap);
  const placeholders = legacyCategories.map(() => "?").join(", ");
  const tags = db.prepare(
    `SELECT id, label, category FROM tags WHERE category IN (${placeholders})`,
  ).all(...legacyCategories) as Array<{ id: number; label: string; category: string }>;
  const insertTerm = db.prepare(
    `INSERT OR IGNORE INTO taxonomy_terms(namespace, term_key, label, version, status)
     VALUES (?, ?, ?, 'v1', 'active')`,
  );
  const findTerm = db.prepare(
    "SELECT id FROM taxonomy_terms WHERE namespace = ? AND term_key = ? AND version = 'v1'",
  );
  const insertMapping = db.prepare(
    `INSERT OR IGNORE INTO tag_taxonomy_mappings(tag_id, taxonomy_term_id, source, confidence)
     VALUES (?, ?, 'legacy', 1)`,
  );

  for (const tag of tags) {
    const namespace = creatorTaxonomyLegacyCategoryMap[tag.category];
    if (!namespace) continue;
    const termKey = legacyTaxonomyTermKey(namespace, tag.label);
    insertTerm.run(namespace, termKey, tag.label);
    const term = findTerm.get(namespace, termKey) as { id: number } | undefined;
    if (term) insertMapping.run(tag.id, term.id);
  }
}

/** 设计策划模块种子：24 节气档期 + 9 类标签槽位 + 默认值池 */
function seedDesignCatalog(db: DatabaseSync) {
  const insertTerm = db.prepare(
    "INSERT OR IGNORE INTO design_solar_terms(name, month_day, theme_hint) VALUES (?, ?, ?)",
  );
  for (const term of designSolarTerms) insertTerm.run(term.name, term.month_day, term.theme_hint);

  const insertCategory = db.prepare(
    "INSERT OR IGNORE INTO design_tag_categories(key, name, hint, pick_count) VALUES (?, ?, ?, ?)",
  );
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO design_tags(category_key, value) VALUES (?, ?)",
  );
  let order = 0;
  for (const category of designTagCategories) {
    insertCategory.run(category.key, category.name, category.hint, category.pick_count);
    for (const value of designTagSeeds[category.key] || []) insertTag.run(category.key, value);
    order += 1;
  }
}

function schema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'subadmin' CHECK(role IN ('subadmin')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'suspended', 'rejected')),
      invite_code TEXT NOT NULL UNIQUE,
      approved_at TEXT,
      approved_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS admin_accounts_status_idx ON admin_accounts(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS creators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      phone_verified_at TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_login_enabled INTEGER NOT NULL DEFAULT 1,
      invite_code TEXT NOT NULL UNIQUE,
      registered_with_code TEXT NOT NULL,
      manager_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      invited_by_creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      wechat TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      booth_description TEXT NOT NULL DEFAULT '',
      booth_description_confirmed_at TEXT,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      available_cities TEXT NOT NULL DEFAULT '[]',
      social_account TEXT NOT NULL DEFAULT '',
      logo_key TEXT,
      slogan TEXT NOT NULL DEFAULT '',
      product_image_key TEXT NOT NULL DEFAULT '',
      booth_image_key TEXT NOT NULL DEFAULT '',
      history_image_key TEXT NOT NULL DEFAULT '',
      work_keys TEXT NOT NULL DEFAULT '[]',
      no_bookings INTEGER NOT NULL DEFAULT 0,
      schedule_confirmed_at TEXT,
      generation_schedule_confirmed_at TEXT,
      generation_schedule_confirmation_used_at TEXT,
      intro_popup_seen_version TEXT NOT NULL DEFAULT '',
      profile_submitted_at TEXT,
      tags_submitted_at TEXT,
      tags_first_submitted_at TEXT,
      application_limit INTEGER,
      free_generation_limit INTEGER NOT NULL DEFAULT 3,
      upgrade_generation_limit INTEGER NOT NULL DEFAULT 3,
      free_generation_used INTEGER NOT NULL DEFAULT 0,
      upgrade_generation_used INTEGER NOT NULL DEFAULT 0,
      service_intents TEXT NOT NULL DEFAULT '["writer"]',
      opportunity_types TEXT NOT NULL DEFAULT '[]',
      opportunity_opt_in INTEGER NOT NULL DEFAULT 0,
      precision_invite_goals TEXT NOT NULL DEFAULT '[]',
      precision_invite_scenes TEXT NOT NULL DEFAULT '[]',
      xiaohongshu_followers INTEGER,
      xiaohongshu_url TEXT NOT NULL DEFAULT '',
      douyin_followers INTEGER,
      douyin_url TEXT NOT NULL DEFAULT '',
      admin_rating TEXT NOT NULL DEFAULT '' CHECK(admin_rating IN ('', 'excellent', 'good', 'average', 'poor')),
      admin_note TEXT NOT NULL DEFAULT '',
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creators_location_idx ON creators(province, city);

    CREATE TABLE IF NOT EXISTS creator_sessions (
      token TEXT PRIMARY KEY,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_sessions_expiry_idx ON creator_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS legal_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      terms_version TEXT NOT NULL,
      privacy_version TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web-register',
      source_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      agreed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(creator_id, terms_version, privacy_version)
    );
    CREATE INDEX IF NOT EXISTS legal_consents_creator_idx ON legal_consents(creator_id, agreed_at DESC);

    CREATE TABLE IF NOT EXISTS creator_section_updates (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(creator_id, section)
    );
    CREATE INDEX IF NOT EXISTS creator_section_updates_time_idx ON creator_section_updates(updated_at);

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_account_id INTEGER REFERENCES admin_accounts(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'super' CHECK(role IN ('super', 'subadmin')),
      actor_label TEXT NOT NULL DEFAULT '超级管理员',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'platform',
      sender TEXT NOT NULL DEFAULT 'admin',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS invite_codes_cross_table_insert
    BEFORE INSERT ON invite_codes
    WHEN EXISTS (SELECT 1 FROM admin_accounts WHERE invite_code = NEW.code)
      OR EXISTS (SELECT 1 FROM creators WHERE invite_code = NEW.code)
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;
    CREATE TRIGGER IF NOT EXISTS invite_codes_cross_table_update
    BEFORE UPDATE OF code ON invite_codes
    WHEN NEW.code != OLD.code AND (
      EXISTS (SELECT 1 FROM admin_accounts WHERE invite_code = NEW.code)
      OR EXISTS (SELECT 1 FROM creators WHERE invite_code = NEW.code)
    )
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;
    CREATE TRIGGER IF NOT EXISTS admin_invites_cross_table_insert
    BEFORE INSERT ON admin_accounts
    WHEN EXISTS (SELECT 1 FROM invite_codes WHERE code = NEW.invite_code)
      OR EXISTS (SELECT 1 FROM creators WHERE invite_code = NEW.invite_code)
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;
    CREATE TRIGGER IF NOT EXISTS admin_invites_cross_table_update
    BEFORE UPDATE OF invite_code ON admin_accounts
    WHEN NEW.invite_code != OLD.invite_code AND (
      EXISTS (SELECT 1 FROM invite_codes WHERE code = NEW.invite_code)
      OR EXISTS (SELECT 1 FROM creators WHERE invite_code = NEW.invite_code)
    )
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;
    CREATE TRIGGER IF NOT EXISTS creator_invites_cross_table_insert
    BEFORE INSERT ON creators
    WHEN EXISTS (SELECT 1 FROM invite_codes WHERE code = NEW.invite_code)
      OR EXISTS (SELECT 1 FROM admin_accounts WHERE invite_code = NEW.invite_code)
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;
    CREATE TRIGGER IF NOT EXISTS creator_invites_cross_table_update
    BEFORE UPDATE OF invite_code ON creators
    WHEN NEW.invite_code != OLD.invite_code AND (
      EXISTS (SELECT 1 FROM invite_codes WHERE code = NEW.invite_code)
      OR EXISTS (SELECT 1 FROM admin_accounts WHERE invite_code = NEW.invite_code)
    )
    BEGIN
      SELECT RAISE(ABORT, '邀请码已存在');
    END;

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, label)
    );
    CREATE INDEX IF NOT EXISTS tags_category_idx ON tags(category, status);

    CREATE TABLE IF NOT EXISTS creator_tags (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'creator',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(creator_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS taxonomy_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL CHECK(namespace IN ('R', 'I', 'O', 'X', 'P', 'E', 'S')),
      term_key TEXT NOT NULL,
      label TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT 'v1',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'retired')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(namespace, term_key, version)
    );
    CREATE INDEX IF NOT EXISTS taxonomy_terms_lookup_idx ON taxonomy_terms(namespace, version, status, term_key);

    CREATE TABLE IF NOT EXISTS tag_taxonomy_mappings (
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'legacy' CHECK(source IN ('legacy', 'curated', 'ai')),
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(tag_id, taxonomy_term_id, source)
    );
    CREATE INDEX IF NOT EXISTS tag_taxonomy_mappings_term_idx ON tag_taxonomy_mappings(taxonomy_term_id, source);

    CREATE TABLE IF NOT EXISTS creator_taxonomy_terms (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
      source TEXT NOT NULL DEFAULT 'discovery'
        CHECK(source IN ('discovery', 'curated', 'admin', 'import', 'cooperation')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(creator_id, taxonomy_term_id, source)
    );
    CREATE INDEX IF NOT EXISTS creator_taxonomy_terms_term_idx
      ON creator_taxonomy_terms(taxonomy_term_id, creator_id, source);

    CREATE TABLE IF NOT EXISTS creator_cooperation_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id) ON DELETE CASCADE,
      adaptation_preferences TEXT NOT NULL DEFAULT '[]',
      opportunity_interests TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_cooperation_preferences_updated_idx
      ON creator_cooperation_preferences(updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_cooperation_supply_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      namespace TEXT NOT NULL CHECK(namespace IN ('O', 'X')),
      original_text TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'self' CHECK(source IN ('self')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(creator_id, namespace, original_text)
    );
    CREATE INDEX IF NOT EXISTS creator_cooperation_supply_facts_lookup_idx
      ON creator_cooperation_supply_facts(creator_id, namespace, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_portraits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id) ON DELETE CASCADE,
      public_id TEXT NOT NULL UNIQUE,
      guide_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'claimed')),
      display_title_override TEXT NOT NULL DEFAULT '',
      representative_line_override TEXT NOT NULL DEFAULT '',
      hero_media_key TEXT NOT NULL DEFAULT '',
      gallery_media_json TEXT NOT NULL DEFAULT '[]',
      visibility_json TEXT NOT NULL DEFAULT '{}',
      claimed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_portraits_status_idx
      ON creator_portraits(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_discovery_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      version TEXT NOT NULL DEFAULT 'v1',
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK(status IN ('in_progress', 'completed', 'feedback')),
      current_question_key TEXT NOT NULL DEFAULT 'q1_identity_category',
      completed_at TEXT,
      feedback_completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(creator_id, version)
    );
    CREATE INDEX IF NOT EXISTS creator_discovery_sessions_status_idx
      ON creator_discovery_sessions(creator_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_discovery_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES creator_discovery_sessions(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      question_key TEXT NOT NULL,
      version TEXT NOT NULL,
      selection_json TEXT NOT NULL DEFAULT '{}',
      original_text TEXT NOT NULL DEFAULT '',
      difference_original TEXT NOT NULL DEFAULT '',
      memory_line_original TEXT NOT NULL DEFAULT '',
      memory_line_source TEXT NOT NULL DEFAULT ''
        CHECK(memory_line_source IN ('', 'self', 'ai', 'rule', 'fact')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, question_key)
    );
    CREATE INDEX IF NOT EXISTS creator_discovery_answers_creator_idx
      ON creator_discovery_answers(creator_id, question_key, version);

    CREATE TABLE IF NOT EXISTS creator_discovery_answer_terms (
      answer_id INTEGER NOT NULL REFERENCES creator_discovery_answers(id) ON DELETE CASCADE,
      taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(answer_id, taxonomy_term_id)
    );
    CREATE INDEX IF NOT EXISTS creator_discovery_answer_terms_term_idx
      ON creator_discovery_answer_terms(taxonomy_term_id, answer_id);

    CREATE TABLE IF NOT EXISTS creator_discovery_answer_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      answer_id INTEGER NOT NULL REFERENCES creator_discovery_answers(id) ON DELETE CASCADE,
      media_key TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private'
        CHECK(visibility IN ('private', 'public')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(answer_id, media_key)
    );

    CREATE TABLE IF NOT EXISTS creator_discovery_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES creator_discovery_sessions(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      insight_type TEXT NOT NULL
        CHECK(insight_type IN ('traits', 'display_title', 'representative_line', 'emotion')),
      content TEXT NOT NULL,
      taxonomy_term_id INTEGER REFERENCES taxonomy_terms(id) ON DELETE SET NULL,
      source TEXT NOT NULL CHECK(source IN ('rule', 'ai', 'self', 'fact')),
      status TEXT NOT NULL DEFAULT 'candidate'
        CHECK(status IN ('candidate', 'confirmed', 'rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_discovery_insights_lookup_idx
      ON creator_discovery_insights(session_id, insight_type, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS busy_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS busy_periods_dates_idx ON busy_periods(start_date, end_date);

    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      poster_key TEXT,
      accent TEXT NOT NULL DEFAULT '#555B63',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS themes_order_idx ON themes(active, sort_order);

    CREATE TABLE IF NOT EXISTS theme_tags (
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(theme_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS creator_theme_interests (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      selected INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(creator_id, theme_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      theme_id INTEGER NOT NULL REFERENCES themes(id),
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      participation TEXT NOT NULL DEFAULT '',
      tag_ids TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      has_conflict INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      snapshot TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS applications_creator_idx ON applications(creator_id, updated_at);
    CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status, updated_at);

    CREATE TABLE IF NOT EXISTS platform_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'platform',
      sender TEXT NOT NULL DEFAULT 'admin',
      created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      filter_snapshot TEXT NOT NULL DEFAULT '{}',
      requested_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      sms_requested_count INTEGER NOT NULL DEFAULT 0,
      sms_sent_count INTEGER NOT NULL DEFAULT 0,
      sms_failed_count INTEGER NOT NULL DEFAULT 0,
      wecom_requested_count INTEGER NOT NULL DEFAULT 0,
      wecom_sent_count INTEGER NOT NULL DEFAULT 0,
      wecom_failed_count INTEGER NOT NULL DEFAULT 0,
      wecom_unbound_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inbox_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES platform_notifications(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'system',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT NOT NULL DEFAULT '',
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS inbox_recipient_idx ON inbox_messages(recipient_id, read_at, created_at);

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sms_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      client_ip TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sms_verifications_phone_idx ON sms_verifications(phone, purpose, created_at DESC);

    CREATE TABLE IF NOT EXISTS sms_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      campaign_id INTEGER REFERENCES platform_notifications(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      template_code TEXT NOT NULL DEFAULT '',
      provider_request_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sms_deliveries_phone_idx ON sms_deliveries(phone, created_at DESC);

    CREATE TABLE IF NOT EXISTS copy_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('free', 'upgrade')),
      status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed')),
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      input_snapshot TEXT NOT NULL DEFAULT '{}',
      template_version TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'internal',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS copy_generations_creator_idx ON copy_generations(creator_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS copy_generations_status_idx ON copy_generations(status, mode, created_at DESC);

    CREATE TABLE IF NOT EXISTS trend_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT '管理员录入',
      related_tags TEXT NOT NULL DEFAULT '[]',
      related_categories TEXT NOT NULL DEFAULT '[]',
      score REAL NOT NULL DEFAULT 50,
      confidence REAL NOT NULL DEFAULT 50,
      risk REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('enabled', 'pending', 'expired', 'blacklist')),
      use_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS trend_terms_match_idx ON trend_terms(status, score DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS trend_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      automatic_update INTEGER NOT NULL DEFAULT 1,
      update_interval_hours INTEGER NOT NULL DEFAULT 24,
      weekly_full_update_day INTEGER NOT NULL DEFAULT 1,
      daily_cleanup_hour INTEGER NOT NULL DEFAULT 4,
      rotation_batch_size INTEGER NOT NULL DEFAULT 20,
      base_enabled INTEGER NOT NULL DEFAULT 1,
      upgrade_enabled INTEGER NOT NULL DEFAULT 1,
      base_max_terms INTEGER NOT NULL DEFAULT 1,
      upgrade_max_terms INTEGER NOT NULL DEFAULT 2,
      last_auto_update_at TEXT,
      last_full_update_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO trend_settings(id) VALUES (1);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS consumer_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT NOT NULL UNIQUE,
      unionid TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS consumer_accounts_city_idx ON consumer_accounts(city, district, created_at DESC);

    CREATE TABLE IF NOT EXISTS mini_sessions (
      token TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('consumer', 'creator')),
      actor_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS mini_sessions_actor_idx ON mini_sessions(actor_type, actor_id, expires_at);
    CREATE INDEX IF NOT EXISTS mini_sessions_expiry_idx ON mini_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS creator_wechat_bindings (
      creator_id INTEGER PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
      consumer_id INTEGER UNIQUE REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      openid TEXT NOT NULL UNIQUE,
      unionid TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'rejected')),
      workspace_enabled INTEGER NOT NULL DEFAULT 1,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS creator_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id) ON DELETE CASCADE,
      consumer_id INTEGER NOT NULL UNIQUE REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'needs_changes', 'active', 'rejected')),
      invite_code TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      representative_image_key TEXT NOT NULL DEFAULT '',
      logo_image_key TEXT NOT NULL DEFAULT '',
      slogan TEXT NOT NULL DEFAULT '',
      product_image_key TEXT NOT NULL DEFAULT '',
      booth_image_key TEXT NOT NULL DEFAULT '',
      history_image_key TEXT NOT NULL DEFAULT '',
      tag_ids TEXT NOT NULL DEFAULT '[]',
      custom_tags TEXT NOT NULL DEFAULT '[]',
      opportunity_types TEXT NOT NULL DEFAULT '[]',
      busy_periods TEXT NOT NULL DEFAULT '[]',
      no_bookings INTEGER NOT NULL DEFAULT 0,
      agreement_version TEXT NOT NULL DEFAULT 'creator-application-v2',
      privacy_version TEXT NOT NULL DEFAULT 'privacy-v2',
      public_authorized INTEGER NOT NULL DEFAULT 0,
      consent_at TEXT,
      phone_public_authorized INTEGER NOT NULL DEFAULT 0,
      phone_consent_at TEXT,
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      reviewed_by TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_applications_status_idx ON creator_applications(status, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS creator_applications_manager_lookup_idx ON creator_applications(creator_id, status);

    CREATE TABLE IF NOT EXISTS tde_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      short_intro TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      cover_key TEXT,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      business_hours TEXT NOT NULL DEFAULT '',
      registration_deadline TEXT NOT NULL DEFAULT '',
      category_tags TEXT NOT NULL DEFAULT '[]',
      max_participants INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'recruiting', 'full', 'ended', 'cancelled')),
      organizer TEXT NOT NULL DEFAULT 'TDE官方',
      view_count INTEGER NOT NULL DEFAULT 0,
      created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS tde_events_public_idx ON tde_events(status, city, district, start_date);
    CREATE INDEX IF NOT EXISTS tde_events_created_idx ON tde_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES tde_events(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      message TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, creator_id)
    );
    CREATE INDEX IF NOT EXISTS event_registrations_event_idx ON event_registrations(event_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS event_registrations_creator_idx ON event_registrations(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS event_registration_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES tde_events(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('apply', 'cancel', 'review')),
      from_status TEXT NOT NULL DEFAULT '',
      to_status TEXT NOT NULL DEFAULT '',
      actor_type TEXT NOT NULL CHECK(actor_type IN ('creator', 'admin', 'system')),
      actor_id TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS event_registration_actions_registration_idx
      ON event_registration_actions(registration_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS event_registration_actions_creator_idx
      ON event_registration_actions(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      short_intro TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image_key TEXT,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      no_plan INTEGER NOT NULL DEFAULT 0,
      accepts_qideng_during_activity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'paused', 'archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      consultation_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS activities_public_idx ON activities(status, city, district, start_date, end_date);
    CREATE INDEX IF NOT EXISTS activities_creator_idx ON activities(creator_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS activity_tags (
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(activity_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS draw_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      guest_id TEXT NOT NULL,
      consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE SET NULL,
      filter_snapshot TEXT NOT NULL DEFAULT '{}',
      activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      revealed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS draw_sessions_guest_idx ON draw_sessions(guest_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS draw_sessions_activity_idx ON draw_sessions(activity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS workshop_discovery_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      guest_id TEXT NOT NULL,
      consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE SET NULL,
      city TEXT NOT NULL DEFAULT '',
      provider_key TEXT NOT NULL,
      content_key TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK(content_type IN ('kit', 'project')),
      workshop_project_id INTEGER REFERENCES workshop_projects(id) ON DELETE SET NULL,
      kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS workshop_discovery_guest_idx
      ON workshop_discovery_sessions(guest_id, city, created_at DESC);
    CREATE INDEX IF NOT EXISTS workshop_discovery_content_idx
      ON workshop_discovery_sessions(content_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS consultation_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'creator' CHECK(kind IN ('creator', 'official')),
      consumer_id INTEGER NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      workshop_project_id INTEGER REFERENCES workshop_projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'waiting', 'resolved', 'closed')),
      subject TEXT NOT NULL DEFAULT '',
      reply_timeout_minutes INTEGER NOT NULL DEFAULT 120,
      creator_unread_count INTEGER NOT NULL DEFAULT 0,
      consumer_unread_count INTEGER NOT NULL DEFAULT 0,
      escalated_at TEXT,
      last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS consultation_threads_consumer_idx ON consultation_threads(consumer_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consultation_threads_creator_idx ON consultation_threads(creator_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consultation_threads_timeout_idx ON consultation_threads(status, last_message_at);

    CREATE TABLE IF NOT EXISTS consultation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES consultation_threads(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('consumer', 'creator', 'admin')),
      sender_id INTEGER,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS consultation_messages_thread_idx ON consultation_messages(thread_id, created_at, id);

    CREATE TABLE IF NOT EXISTS mini_program_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      creator_invitations_enabled INTEGER NOT NULL DEFAULT 0,
      default_activity_limit INTEGER NOT NULL DEFAULT 1,
      default_reply_timeout_minutes INTEGER NOT NULL DEFAULT 120,
      opening_copy TEXT NOT NULL DEFAULT '精选800+新遇官团队 原创体验、审美训练、情绪疗愈、稀奇美味…大人小孩，可逛可玩',
      slogan TEXT NOT NULL DEFAULT '在城市里，发现一次新遇',
      draw_button TEXT NOT NULL DEFAULT '马上探照新遇',
      contact_copy TEXT NOT NULL DEFAULT '联系官方微信、联系官方小红书',
      hero_image_key TEXT,
      loading_image_key TEXT,
      reveal_image_key TEXT,
      share_image_key TEXT,
      creator_application_fields TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO mini_program_settings(id) VALUES (1);

    CREATE TABLE IF NOT EXISTS location_reverse_cache (
      coordinate_key TEXT PRIMARY KEY,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS location_reverse_cache_expiry_idx ON location_reverse_cache(expires_at);

    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'popup' CHECK(kind IN ('store', 'popup', 'partner', 'event')),
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      business_area TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      route_hint TEXT NOT NULL DEFAULT '',
      latitude REAL,
      longitude REAL,
      cover_key TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'paused', 'archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS venues_location_idx ON venues(status, city, district, business_area);

    CREATE TABLE IF NOT EXISTS venue_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
      date_override TEXT NOT NULL DEFAULT '',
      open_time TEXT NOT NULL DEFAULT '',
      close_time TEXT NOT NULL DEFAULT '',
      closed INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS venue_hours_lookup_idx ON venue_hours(venue_id, date_override, weekday);

    CREATE TABLE IF NOT EXISTS kits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      cover_key TEXT,
      gallery_keys TEXT NOT NULL DEFAULT '[]',
      price_cents INTEGER NOT NULL DEFAULT 0,
      age_range TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'easy' CHECK(difficulty IN ('easy', 'medium', 'hard')),
      mess_level TEXT NOT NULL DEFAULT 'low' CHECK(mess_level IN ('low', 'medium', 'high')),
      guidance_type TEXT NOT NULL DEFAULT 'self' CHECK(guidance_type IN ('self', 'staff', 'video', 'creator')),
      safety_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'paused', 'archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS kits_status_idx ON kits(status, sort_order DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS venue_kits (
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
      stock INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 1,
      points_reward INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(venue_id, kit_id)
    );

    CREATE TABLE IF NOT EXISTS kit_guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      media_key TEXT,
      video_url TEXT NOT NULL DEFAULT '',
      safety_level TEXT NOT NULL DEFAULT 'normal' CHECK(safety_level IN ('normal', 'notice', 'warning')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS kit_guides_order_idx ON kit_guides(kit_id, step_order);

    CREATE TABLE IF NOT EXISTS venue_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS venue_rules_order_idx ON venue_rules(venue_id, step_order, id);

    CREATE TABLE IF NOT EXISTS workshop_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      one_liner TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      cover_key TEXT,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      address_hint TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      no_plan INTEGER NOT NULL DEFAULT 0,
      min_people INTEGER NOT NULL DEFAULT 1,
      max_people INTEGER NOT NULL DEFAULT 1,
      price_cents INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      primary_category_tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
      age_range TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT 'easy' CHECK(difficulty IN ('easy', 'medium', 'hard')),
      safety_notes TEXT NOT NULL DEFAULT '',
      operation_draft TEXT NOT NULL DEFAULT '{}',
      selected_for_display INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'published', 'paused', 'archived', 'rejected')),
      review_note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      consultation_count INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS workshop_projects_public_idx ON workshop_projects(status, city, district, sort_order DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS workshop_projects_creator_idx ON workshop_projects(creator_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_onsite_contents (
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      content_label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (creator_id, content_label)
    );
    CREATE INDEX IF NOT EXISTS creator_onsite_contents_order_idx
      ON creator_onsite_contents(creator_id, sort_order, content_label);

    CREATE TABLE IF NOT EXISTS creator_presence (
      creator_id INTEGER PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
      reply_hint TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
      available_date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 1,
      reserved_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'full', 'closed')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS project_schedules_date_idx ON project_schedules(available_date, status, project_id);

    CREATE TABLE IF NOT EXISTS project_tags (
      project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      tag_type TEXT NOT NULL DEFAULT 'scene' CHECK(tag_type IN ('scene', 'interest', 'operation')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(project_id, tag_id, tag_type)
    );

    CREATE TABLE IF NOT EXISTS project_operation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL CHECK(request_type IN ('first_launch', 'limited')),
      rule_acknowledged INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      quantity_note TEXT NOT NULL DEFAULT '',
      starts_at TEXT,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'expired', 'withdrawn')),
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS project_operation_requests_lookup_idx
      ON project_operation_requests(project_id, request_type, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS project_operation_requests_creator_idx
      ON project_operation_requests(creator_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_claim_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      consumed_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_claim_tokens_creator_idx
      ON creator_claim_tokens(creator_id, consumed_at, revoked_at, expires_at);

    CREATE TABLE IF NOT EXISTS review_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('creator_application', 'project', 'operation_request')),
      entity_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
      creator_unread_count INTEGER NOT NULL DEFAULT 0,
      admin_unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS review_threads_creator_idx
      ON review_threads(creator_id, status, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS review_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES review_threads(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('creator', 'admin', 'system')),
      sender_id INTEGER,
      sender_label TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS review_messages_thread_idx
      ON review_messages(thread_id, created_at, id);

    CREATE TABLE IF NOT EXISTS contact_click_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE SET NULL,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES creator_contact_channels(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT 'attempted' CHECK(result IN ('attempted', 'opened', 'failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS contact_click_events_project_idx
      ON contact_click_events(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS contact_click_events_creator_idx
      ON contact_click_events(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS phone_contact_view_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS phone_contact_view_events_consumer_idx
      ON phone_contact_view_events(consumer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS phone_contact_view_events_creator_idx
      ON phone_contact_view_events(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS kit_tags (
      kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      tag_type TEXT NOT NULL DEFAULT 'scene' CHECK(tag_type IN ('scene', 'operation', 'platform')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(kit_id, tag_id, tag_type)
    );

    CREATE TABLE IF NOT EXISTS creator_contact_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES workshop_projects(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL DEFAULT 'wecom' CHECK(channel_type IN ('wecom', 'wechat', 'mini_consult', 'phone', 'other')),
      label TEXT NOT NULL DEFAULT '',
      contact_value TEXT NOT NULL DEFAULT '',
      corp_id TEXT NOT NULL DEFAULT '',
      qr_key TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_contact_channels_lookup_idx ON creator_contact_channels(creator_id, project_id, enabled);

    CREATE TABLE IF NOT EXISTS creator_wecom_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id) ON DELETE CASCADE,
      wecom_user_id TEXT NOT NULL DEFAULT '',
      open_kfid TEXT NOT NULL DEFAULT '',
      contact_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'disabled', 'error')),
      review_reason TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      verified_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_wecom_bindings_status_idx ON creator_wecom_bindings(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS creator_wecom_binding_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      before_snapshot TEXT NOT NULL DEFAULT '{}',
      after_snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS creator_wecom_binding_audit_creator_idx ON creator_wecom_binding_audit(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS wecom_notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES platform_notifications(id) ON DELETE CASCADE,
      creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      wecom_user_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'unbound', 'disabled', 'not_configured')),
      provider_message_id TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      attempted_at TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, creator_id)
    );
    CREATE INDEX IF NOT EXISTS wecom_notification_deliveries_campaign_idx ON wecom_notification_deliveries(campaign_id, status);

    CREATE TABLE IF NOT EXISTS homepage_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      image_key TEXT,
      link_type TEXT NOT NULL DEFAULT 'none' CHECK(link_type IN ('none', 'kit', 'venue', 'project', 'topic', 'url')),
      link_value TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS homepage_banners_active_idx ON homepage_banners(enabled, city, sort_order DESC);

    CREATE TABLE IF NOT EXISTS homepage_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_key TEXT NOT NULL CHECK(slot_key IN ('limited', 'new_today', 'first_launch', 'featured')),
      content_type TEXT NOT NULL CHECK(content_type IN ('kit', 'venue', 'project', 'topic')),
      content_id INTEGER NOT NULL DEFAULT 0,
      title_override TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      created_by_creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
      reviewed_by_admin TEXT NOT NULL DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'approved' CHECK(review_status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS homepage_slots_lookup_idx ON homepage_slots(slot_key, enabled, review_status, sort_order DESC);

    CREATE TABLE IF NOT EXISTS points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      source_id INTEGER,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS points_ledger_consumer_idx ON points_ledger(consumer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
      qr_code TEXT NOT NULL DEFAULT '',
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS checkins_venue_idx ON checkins(venue_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE SET NULL,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'processing', 'resolved', 'closed')),
      handled_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, venue_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS kit_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE SET NULL,
      kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL DEFAULT 5 CHECK(rating BETWEEN 1 AND 5),
      difficulty_rating INTEGER CHECK(difficulty_rating BETWEEN 1 AND 5),
      fun_rating INTEGER CHECK(fun_rating BETWEEN 1 AND 5),
      body TEXT NOT NULL DEFAULT '',
      image_keys TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'hidden')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS kit_reviews_kit_idx ON kit_reviews(kit_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS lightup_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
      kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES workshop_projects(id) ON DELETE SET NULL,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      image_key TEXT,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS lightup_records_consumer_idx ON lightup_records(consumer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS visualization_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      access_scope TEXT NOT NULL DEFAULT 'all' CHECK(access_scope IN ('all', 'province', 'city')),
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      expires_at INTEGER,
      created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_users_phone_idx ON visualization_users(phone);
    CREATE INDEX IF NOT EXISTS visualization_users_status_idx ON visualization_users(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS visualization_sessions (
      token TEXT PRIMARY KEY,
      viz_user_id INTEGER NOT NULL REFERENCES visualization_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_sessions_expiry_idx ON visualization_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS visualization_access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      viz_user_id INTEGER NOT NULL REFERENCES visualization_users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('open', 'extend', 'restore', 'close')),
      days_delta INTEGER NOT NULL DEFAULT 0,
      before_expires_at INTEGER,
      after_expires_at INTEGER,
      operator_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS viz_access_events_user_idx ON visualization_access_events(viz_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS visualization_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      viz_user_id INTEGER REFERENCES visualization_users(id) ON DELETE SET NULL,
      viz_user_name TEXT NOT NULL DEFAULT '',
      viz_user_phone TEXT NOT NULL DEFAULT '',
      download_type TEXT NOT NULL CHECK(download_type IN ('inspiration', 'creator_filter')),
      file_name TEXT NOT NULL DEFAULT '',
      plan_id INTEGER REFERENCES visualization_plans(id) ON DELETE SET NULL,
      creator_snapshots TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_downloads_time_idx ON visualization_downloads(created_at DESC);

    CREATE TABLE IF NOT EXISTS visualization_tag_settings (
      tag_id INTEGER PRIMARY KEY REFERENCES tags(id) ON DELETE CASCADE,
      visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visualization_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'ai', 'resource')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
      resource_project_id TEXT,
      ai_run_id INTEGER,
      created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_by_label TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_plans_lookup_idx
      ON visualization_plans(city, plan_date, status, source, created_at DESC);

    CREATE TABLE IF NOT EXISTS visualization_ai_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      prompt_template TEXT NOT NULL DEFAULT '',
      min_creator_count INTEGER NOT NULL DEFAULT 20,
      schedule_weekday INTEGER NOT NULL DEFAULT 1 CHECK(schedule_weekday BETWEEN 1 AND 7),
      schedule_hour INTEGER NOT NULL DEFAULT 9 CHECK(schedule_hour BETWEEN 0 AND 23),
      horizon_days INTEGER NOT NULL DEFAULT 90,
      require_review INTEGER NOT NULL DEFAULT 1,
      max_candidates_per_run INTEGER NOT NULL DEFAULT 20,
      last_auto_run_at TEXT,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visualization_ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'openai-compatible',
      model TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_env TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      weight INTEGER NOT NULL DEFAULT 1,
      max_concurrency INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_status TEXT NOT NULL DEFAULT 'unused' CHECK(last_status IN ('unused', 'healthy', 'error')),
      last_error TEXT NOT NULL DEFAULT '',
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_ai_providers_route_idx
      ON visualization_ai_providers(enabled, priority, last_status, weight);

    CREATE TABLE IF NOT EXISTS visualization_ai_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual', 'scheduled')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'no_candidates', 'failed')),
      scope_json TEXT NOT NULL DEFAULT '{}',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      generated_count INTEGER NOT NULL DEFAULT 0,
      provider_summary TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS visualization_ai_runs_queue_idx
      ON visualization_ai_runs(status, created_at);

    -- 设计策划模块（在线矢量海报）
    CREATE TABLE IF NOT EXISTS design_solar_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      month_day TEXT NOT NULL,
      theme_hint TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS design_tag_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      pick_count INTEGER NOT NULL DEFAULT 1,
      required INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS design_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_key TEXT NOT NULL REFERENCES design_tag_categories(key) ON DELETE CASCADE,
      value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_key, value)
    );
    CREATE INDEX IF NOT EXISTS design_tags_category_idx ON design_tags(category_key, status);

    CREATE TABLE IF NOT EXISTS design_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT 'https://ark.cn-beijing.volces.com/api/v3',
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS design_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      solar_term_id INTEGER NOT NULL REFERENCES design_solar_terms(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'confirmed', 'archived')),
      selected_draft_id INTEGER,
      operator_id INTEGER REFERENCES design_api_keys(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS design_sessions_term_idx ON design_sessions(solar_term_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS design_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      tag_combo TEXT NOT NULL DEFAULT '[]',
      prompt_text TEXT NOT NULL DEFAULT '',
      brief_json TEXT NOT NULL DEFAULT '{}',
      svg TEXT NOT NULL DEFAULT '',
      svg_size INTEGER NOT NULL DEFAULT 0,
      style_key TEXT NOT NULL DEFAULT '',
      grid_key TEXT NOT NULL DEFAULT '',
      palette TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated', 'selected', 'failed')),
      error TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, version)
    );
    CREATE INDEX IF NOT EXISTS design_drafts_session_idx ON design_drafts(session_id, version DESC);
  `);

  const portraitColumns = new Set(
    (db.prepare("PRAGMA table_info(creator_portraits)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!portraitColumns.has("gallery_configured"))
    db.exec("ALTER TABLE creator_portraits ADD COLUMN gallery_configured INTEGER NOT NULL DEFAULT 0");

  const creatorTaxonomyTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'creator_taxonomy_terms'",
  ).get() as { sql?: string } | undefined;
  const creatorTaxonomySql = creatorTaxonomyTable?.sql || "";
  if (
    !creatorTaxonomySql.includes("'cooperation'")
    || !creatorTaxonomySql.includes("PRIMARY KEY(creator_id, taxonomy_term_id, source)")
  ) {
    db.exec(`
      CREATE TABLE creator_taxonomy_terms_phase2c (
        creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
        taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
        source TEXT NOT NULL DEFAULT 'discovery'
          CHECK(source IN ('discovery', 'curated', 'admin', 'import', 'cooperation')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(creator_id, taxonomy_term_id, source)
      );
      INSERT INTO creator_taxonomy_terms_phase2c(
        creator_id, taxonomy_term_id, source, created_at, updated_at
      )
      SELECT creator_id, taxonomy_term_id, source, created_at, updated_at
      FROM creator_taxonomy_terms;
      DROP TABLE creator_taxonomy_terms;
      ALTER TABLE creator_taxonomy_terms_phase2c RENAME TO creator_taxonomy_terms;
      CREATE INDEX creator_taxonomy_terms_term_idx
        ON creator_taxonomy_terms(taxonomy_term_id, creator_id, source);
    `);
  }

  db.prepare(
    `INSERT OR IGNORE INTO visualization_ai_settings(
      id, prompt_template, min_creator_count, schedule_weekday, schedule_hour, horizon_days,
      require_review, max_candidates_per_run
    ) VALUES (1, ?, 20, 1, 9, 90, 1, 20)`,
  ).run(
    "你是TDE线下活动策划助手。请结合城市、日期、节气或积极节日、可邀约主理人数量及作品/体验/客群/风格标签，生成一个克制、具体、可执行的活动主题和简介。只输出JSON：{\"title\":\"不超过30字\",\"description\":\"不超过300字\"}。",
  );

  // 迁移：visualization_users 表添加 access_scope 字段（旧数据库兼容）
  try {
    const columns = db.prepare("PRAGMA table_info(visualization_users)").all() as { name: string }[];
    if (!columns.some((col) => col.name === "access_scope")) {
      db.exec("ALTER TABLE visualization_users ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'all'");
    }
  } catch {
    // 表不存在时忽略，schema 已包含该字段
  }

  // 迁移：活动增加营业时间字段（旧数据库兼容）
  try {
    const columns = db.prepare("PRAGMA table_info(tde_events)").all() as { name: string }[];
    if (!columns.some((col) => col.name === "business_hours")) {
      db.exec("ALTER TABLE tde_events ADD COLUMN business_hours TEXT NOT NULL DEFAULT ''");
    }
  } catch {
    // 表不存在时忽略，schema 已包含该字段
  }

  // 迁移：方案投放从单日扩展为起止日期，旧方案保持原日期不变。
  try {
    const columns = db.prepare("PRAGMA table_info(visualization_plans)").all() as { name: string }[];
    if (!columns.some((col) => col.name === "start_date")) {
      db.exec("ALTER TABLE visualization_plans ADD COLUMN start_date TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.some((col) => col.name === "end_date")) {
      db.exec("ALTER TABLE visualization_plans ADD COLUMN end_date TEXT NOT NULL DEFAULT ''");
    }
    db.exec(`UPDATE visualization_plans
      SET start_date = CASE WHEN start_date = '' THEN plan_date ELSE start_date END,
          end_date = CASE WHEN end_date = '' THEN plan_date ELSE end_date END`);
    db.exec("CREATE INDEX IF NOT EXISTS visualization_plans_range_idx ON visualization_plans(city, start_date, end_date, status)");
  } catch {
    // 表不存在时忽略，schema 已包含这些字段
  }

  const trendAutomationMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'trend_automation_v1'",
  ).get() as { value: string } | undefined;
  if (!trendAutomationMigration) {
    db.exec("UPDATE trend_settings SET automatic_update = 1 WHERE id = 1 AND automatic_update = 0 AND last_auto_update_at IS NULL");
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('trend_automation_v1', 'complete')").run();
  }
  const creatorColumns = new Set(
    (db.prepare("PRAGMA table_info(creators)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!creatorColumns.has("profile_submitted_at"))
    db.exec("ALTER TABLE creators ADD COLUMN profile_submitted_at TEXT");
  if (!creatorColumns.has("phone_verified_at"))
    db.exec("ALTER TABLE creators ADD COLUMN phone_verified_at TEXT");
  if (!creatorColumns.has("password_login_enabled"))
    db.exec("ALTER TABLE creators ADD COLUMN password_login_enabled INTEGER NOT NULL DEFAULT 1");
  if (!creatorColumns.has("tags_submitted_at"))
    db.exec("ALTER TABLE creators ADD COLUMN tags_submitted_at TEXT");
  if (!creatorColumns.has("tags_first_submitted_at")) {
    db.exec("ALTER TABLE creators ADD COLUMN tags_first_submitted_at TEXT");
    db.exec("UPDATE creators SET tags_first_submitted_at = tags_submitted_at WHERE tags_submitted_at IS NOT NULL");
  }
  if (!creatorColumns.has("booth_description"))
    db.exec("ALTER TABLE creators ADD COLUMN booth_description TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("booth_description_confirmed_at"))
    db.exec("ALTER TABLE creators ADD COLUMN booth_description_confirmed_at TEXT");
  if (!creatorColumns.has("generation_schedule_confirmed_at"))
    db.exec("ALTER TABLE creators ADD COLUMN generation_schedule_confirmed_at TEXT");
  if (!creatorColumns.has("generation_schedule_confirmation_used_at"))
    db.exec("ALTER TABLE creators ADD COLUMN generation_schedule_confirmation_used_at TEXT");
  if (!creatorColumns.has("intro_popup_seen_version")) {
    db.exec("ALTER TABLE creators ADD COLUMN intro_popup_seen_version TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE creators SET intro_popup_seen_version = '1'");
  }
  if (!creatorColumns.has("free_generation_limit"))
    db.exec("ALTER TABLE creators ADD COLUMN free_generation_limit INTEGER NOT NULL DEFAULT 3");
  if (!creatorColumns.has("upgrade_generation_limit"))
    db.exec("ALTER TABLE creators ADD COLUMN upgrade_generation_limit INTEGER NOT NULL DEFAULT 3");
  if (!creatorColumns.has("free_generation_used")) {
    db.exec("ALTER TABLE creators ADD COLUMN free_generation_used INTEGER NOT NULL DEFAULT 0");
    db.exec(`UPDATE creators SET free_generation_used = (
      SELECT COUNT(*) FROM copy_generations
      WHERE copy_generations.creator_id = creators.id AND mode = 'free' AND status = 'completed'
    )`);
  }
  if (!creatorColumns.has("upgrade_generation_used")) {
    db.exec("ALTER TABLE creators ADD COLUMN upgrade_generation_used INTEGER NOT NULL DEFAULT 0");
    db.exec(`UPDATE creators SET upgrade_generation_used = (
      SELECT COUNT(*) FROM copy_generations
      WHERE copy_generations.creator_id = creators.id AND mode = 'upgrade' AND status = 'completed'
    )`);
  }
  if (!creatorColumns.has("manager_admin_id"))
    db.exec("ALTER TABLE creators ADD COLUMN manager_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL");
  if (!creatorColumns.has("invited_by_creator_id"))
    db.exec("ALTER TABLE creators ADD COLUMN invited_by_creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL");
  if (!creatorColumns.has("created_by_admin_id"))
    db.exec("ALTER TABLE creators ADD COLUMN created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL");
  if (!creatorColumns.has("service_intents"))
    db.exec("ALTER TABLE creators ADD COLUMN service_intents TEXT NOT NULL DEFAULT '[\"writer\"]'");
  if (!creatorColumns.has("opportunity_types"))
    db.exec("ALTER TABLE creators ADD COLUMN opportunity_types TEXT NOT NULL DEFAULT '[]'");
  if (!creatorColumns.has("opportunity_opt_in"))
    db.exec("ALTER TABLE creators ADD COLUMN opportunity_opt_in INTEGER NOT NULL DEFAULT 0");
  if (!creatorColumns.has("precision_invite_goals"))
    db.exec("ALTER TABLE creators ADD COLUMN precision_invite_goals TEXT NOT NULL DEFAULT '[]'");
  if (!creatorColumns.has("precision_invite_scenes"))
    db.exec("ALTER TABLE creators ADD COLUMN precision_invite_scenes TEXT NOT NULL DEFAULT '[]'");
  if (!creatorColumns.has("xiaohongshu_followers"))
    db.exec("ALTER TABLE creators ADD COLUMN xiaohongshu_followers INTEGER");
  if (!creatorColumns.has("xiaohongshu_url"))
    db.exec("ALTER TABLE creators ADD COLUMN xiaohongshu_url TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("douyin_followers"))
    db.exec("ALTER TABLE creators ADD COLUMN douyin_followers INTEGER");
  if (!creatorColumns.has("douyin_url"))
    db.exec("ALTER TABLE creators ADD COLUMN douyin_url TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("admin_rating"))
    db.exec("ALTER TABLE creators ADD COLUMN admin_rating TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("admin_note"))
    db.exec("ALTER TABLE creators ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("district"))
    db.exec("ALTER TABLE creators ADD COLUMN district TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("activity_limit"))
    db.exec("ALTER TABLE creators ADD COLUMN activity_limit INTEGER");
  if (!creatorColumns.has("reply_timeout_minutes"))
    db.exec("ALTER TABLE creators ADD COLUMN reply_timeout_minutes INTEGER");
  const discoveryAnswerColumns = new Set(
    (db.prepare("PRAGMA table_info(creator_discovery_answers)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!discoveryAnswerColumns.has("difference_original"))
    db.exec("ALTER TABLE creator_discovery_answers ADD COLUMN difference_original TEXT NOT NULL DEFAULT ''");
  if (!discoveryAnswerColumns.has("memory_line_original"))
    db.exec("ALTER TABLE creator_discovery_answers ADD COLUMN memory_line_original TEXT NOT NULL DEFAULT ''");
  db.exec(`
    UPDATE creator_discovery_answers
    SET difference_original = original_text
    WHERE question_key = 'q3_difference' AND difference_original = '';
    UPDATE creator_discovery_answers
    SET memory_line_original = original_text
    WHERE question_key = 'q4_memory' AND memory_line_original = '';
  `);
  const adminAccountColumns = new Set(
    (db.prepare("PRAGMA table_info(admin_accounts)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!adminAccountColumns.has("name"))
    db.exec("ALTER TABLE admin_accounts ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  const miniProgramSettingColumns = new Set(
    (db.prepare("PRAGMA table_info(mini_program_settings)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!miniProgramSettingColumns.has("creator_application_fields"))
    db.exec("ALTER TABLE mini_program_settings ADD COLUMN creator_application_fields TEXT NOT NULL DEFAULT '{}'");
  if (!miniProgramSettingColumns.has("creator_invitations_enabled"))
    db.exec("ALTER TABLE mini_program_settings ADD COLUMN creator_invitations_enabled INTEGER NOT NULL DEFAULT 0");
  if (!miniProgramSettingColumns.has("contact_copy"))
    db.exec("ALTER TABLE mini_program_settings ADD COLUMN contact_copy TEXT NOT NULL DEFAULT '联系官方微信、联系官方小红书'");
  const bindingColumns = new Set(
    (db.prepare("PRAGMA table_info(creator_wechat_bindings)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!bindingColumns.has("consumer_id"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN consumer_id INTEGER REFERENCES consumer_accounts(id) ON DELETE CASCADE");
  if (!bindingColumns.has("status"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!bindingColumns.has("submitted_at"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN submitted_at TEXT");
  if (!bindingColumns.has("reviewed_at"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN reviewed_at TEXT");
  if (!bindingColumns.has("reviewed_by"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT ''");
  if (!bindingColumns.has("workspace_enabled"))
    db.exec("ALTER TABLE creator_wechat_bindings ADD COLUMN workspace_enabled INTEGER NOT NULL DEFAULT 1");
  const creatorApplicationColumns = new Set(
    (db.prepare("PRAGMA table_info(creator_applications)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!creatorApplicationColumns.has("intro"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN intro TEXT NOT NULL DEFAULT ''");
  if (!creatorApplicationColumns.has("logo_image_key"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN logo_image_key TEXT NOT NULL DEFAULT ''");
  if (!creatorApplicationColumns.has("phone_public_authorized"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN phone_public_authorized INTEGER NOT NULL DEFAULT 0");
  if (!creatorApplicationColumns.has("phone_consent_at"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN phone_consent_at TEXT");
  if (!creatorApplicationColumns.has("no_bookings")) {
    db.exec("ALTER TABLE creator_applications ADD COLUMN no_bookings INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      UPDATE creator_applications
      SET no_bookings = COALESCE((
        SELECT creators.no_bookings FROM creators WHERE creators.id = creator_applications.creator_id
      ), 0)
    `);
  }
  // TDE 新增字段：7字slogan + 5张图（原表只有representative_image_key和logo_image_key）
  if (!creatorApplicationColumns.has("slogan"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN slogan TEXT NOT NULL DEFAULT ''");
  if (!creatorApplicationColumns.has("product_image_key"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN product_image_key TEXT NOT NULL DEFAULT ''");
  if (!creatorApplicationColumns.has("booth_image_key"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN booth_image_key TEXT NOT NULL DEFAULT ''");
  if (!creatorApplicationColumns.has("history_image_key"))
    db.exec("ALTER TABLE creator_applications ADD COLUMN history_image_key TEXT NOT NULL DEFAULT ''");
  // creators 表新增字段
  if (!creatorColumns.has("slogan"))
    db.exec("ALTER TABLE creators ADD COLUMN slogan TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("product_image_key"))
    db.exec("ALTER TABLE creators ADD COLUMN product_image_key TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("booth_image_key"))
    db.exec("ALTER TABLE creators ADD COLUMN booth_image_key TEXT NOT NULL DEFAULT ''");
  if (!creatorColumns.has("history_image_key"))
    db.exec("ALTER TABLE creators ADD COLUMN history_image_key TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS creator_wechat_consumer_idx ON creator_wechat_bindings(consumer_id) WHERE consumer_id IS NOT NULL");
  db.exec(`
    INSERT OR IGNORE INTO creator_applications(
      creator_id, consumer_id, status, invite_code, phone, brand_name, intro, province, city, district,
      public_authorized, consent_at, review_note, reviewed_at, reviewed_by, submitted_at
    )
    SELECT b.creator_id, b.consumer_id, b.status, c.registered_with_code, c.phone, c.brand_name, c.intro,
      c.province, c.city, c.district, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END,
      b.submitted_at, '', b.reviewed_at, b.reviewed_by, COALESCE(b.submitted_at, CURRENT_TIMESTAMP)
    FROM creator_wechat_bindings b
    JOIN creators c ON c.id = b.creator_id
    WHERE b.consumer_id IS NOT NULL
  `);
  const projectColumns = new Set(
    (db.prepare("PRAGMA table_info(workshop_projects)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!projectColumns.has("start_date"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("end_date"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN end_date TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("no_plan"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN no_plan INTEGER NOT NULL DEFAULT 0");
  if (!projectColumns.has("selected_for_display")) {
    db.exec("ALTER TABLE workshop_projects ADD COLUMN selected_for_display INTEGER NOT NULL DEFAULT 0");
    db.exec(`UPDATE workshop_projects SET selected_for_display = 1
      WHERE id IN (
        SELECT MAX(id) FROM workshop_projects WHERE status = 'published' GROUP BY creator_id
      )`);
  }
  if (!projectColumns.has("primary_category_tag_id"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN primary_category_tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL");
  if (!projectColumns.has("age_range"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN age_range TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("difficulty"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'easy'");
  if (!projectColumns.has("safety_notes"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN safety_notes TEXT NOT NULL DEFAULT ''");
  if (!projectColumns.has("operation_draft"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN operation_draft TEXT NOT NULL DEFAULT '{}'");
  if (!projectColumns.has("published_at"))
    db.exec("ALTER TABLE workshop_projects ADD COLUMN published_at TEXT");
  const consultationColumns = new Set(
    (db.prepare("PRAGMA table_info(consultation_threads)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!consultationColumns.has("workshop_project_id"))
    db.exec("ALTER TABLE consultation_threads ADD COLUMN workshop_project_id INTEGER REFERENCES workshop_projects(id) ON DELETE SET NULL");
  const projectSourceMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'workshop_project_source_v1'",
  ).get() as { value: string } | undefined;
  if (!projectSourceMigration) {
    db.exec(`
      INSERT OR IGNORE INTO workshop_projects(
        reference, creator_id, one_liner, title, description, cover_key, province, city, district,
        address_hint, start_date, end_date, no_plan, min_people, max_people, status, sort_order,
        view_count, consultation_count, created_at, updated_at
      )
      SELECT
        'PW-MIG-' || a.id, a.creator_id, COALESCE(NULLIF(a.short_intro, ''), a.title), a.title,
        a.description, a.image_key, a.province, a.city, a.district, a.address, a.start_date, a.end_date,
        a.no_plan, 1, 4, a.status, a.sort_order, a.view_count, a.consultation_count, a.created_at, a.updated_at
      FROM activities a
      WHERE NOT EXISTS (SELECT 1 FROM workshop_projects p WHERE p.reference = 'PW-MIG-' || a.id);

      INSERT OR IGNORE INTO project_tags(project_id, tag_id, tag_type)
      SELECT p.id, at.tag_id,
        CASE t.category WHEN '项目场景' THEN 'scene' WHEN '项目运营' THEN 'operation' ELSE 'interest' END
      FROM activities a
      JOIN workshop_projects p ON p.reference = 'PW-MIG-' || a.id
      JOIN activity_tags at ON at.activity_id = a.id
      JOIN tags t ON t.id = at.tag_id;

      UPDATE consultation_threads
      SET workshop_project_id = (
        SELECT p.id FROM workshop_projects p WHERE p.reference = 'PW-MIG-' || consultation_threads.activity_id
      )
      WHERE activity_id IS NOT NULL AND workshop_project_id IS NULL;
    `);
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('workshop_project_source_v1', 'complete')").run();
  }
  const projectDisplayMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'workshop_project_display_v1'",
  ).get() as { value: string } | undefined;
  if (!projectDisplayMigration) {
    db.exec(`
      UPDATE workshop_projects SET selected_for_display = 0;
      UPDATE workshop_projects SET selected_for_display = 1
      WHERE id IN (
        SELECT MAX(id) FROM workshop_projects WHERE status = 'published' GROUP BY creator_id
      );
    `);
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('workshop_project_display_v1', 'complete')").run();
  }
  const contactColumns = new Set(
    (db.prepare("PRAGMA table_info(creator_contact_channels)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!contactColumns.has("corp_id"))
    db.exec("ALTER TABLE creator_contact_channels ADD COLUMN corp_id TEXT NOT NULL DEFAULT ''");
  const cityInterestBrandMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'city_interest_brand_v1'",
  ).get() as { value: string } | undefined;
  if (!cityInterestBrandMigration) {
    db.exec(`UPDATE mini_program_settings
      SET opening_copy = '精选800+新遇官团队 原创体验、审美训练、情绪疗愈、稀奇美味…大人小孩，可逛可玩',
          slogan = '在城市里，发现一次新遇',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`);
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('city_interest_brand_v1', 'complete')").run();
  }
  const cityDiscoveryHomeMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'city_discovery_home_v1'",
  ).get() as { value: string } | undefined;
  if (!cityDiscoveryHomeMigration) {
    db.prepare("UPDATE mini_program_settings SET draw_button = '马上探照新遇', updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('city_discovery_home_v1', 'complete')").run();
  }
  const companionOfficerNamingMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'companion_officer_naming_v1'",
  ).get() as { value: string } | undefined;
  if (!companionOfficerNamingMigration) {
    db.exec(`UPDATE mini_program_settings
      SET creator_application_fields = REPLACE(
        REPLACE(creator_application_fields, '"label":"创作者标签"', '"label":"新遇官标签"'),
        '"label": "创作者标签"', '"label": "新遇官标签"'
      ),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`);
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('companion_officer_naming_v1', 'complete')").run();
  }
  const retiredPresenceMigration = db.prepare(
    "SELECT value FROM platform_settings WHERE key = 'retired_creator_presence_v1'",
  ).get() as { value: string } | undefined;
  if (!retiredPresenceMigration) {
    const cleanOpportunityTypes = (table: "creators" | "creator_applications") => {
      const rows = db.prepare(`SELECT id, opportunity_types FROM ${table}`).all() as Array<{ id: number; opportunity_types: string }>;
      const update = db.prepare(`UPDATE ${table} SET opportunity_types = ? WHERE id = ?`);
      for (const row of rows) {
        let values: unknown[] = [];
        try { values = JSON.parse(row.opportunity_types || "[]") as unknown[]; } catch { values = []; }
        const next = values.map(String).filter((value) => value && value !== "同城约见");
        if (JSON.stringify(next) !== JSON.stringify(values)) update.run(JSON.stringify(next), row.id);
      }
    };
    cleanOpportunityTypes("creators");
    cleanOpportunityTypes("creator_applications");
    db.prepare("UPDATE creators SET intro = '' WHERE intro = 'QIDENG_PREVIEW_DEMO'").run();
    db.prepare("UPDATE creator_applications SET intro = '' WHERE intro = 'QIDENG_PREVIEW_DEMO'").run();
    db.prepare("UPDATE kits SET description = TRIM(REPLACE(description, 'QIDENG_PREVIEW_DEMO', '')) WHERE description LIKE '%QIDENG_PREVIEW_DEMO%'").run();
    db.prepare("INSERT OR IGNORE INTO platform_settings(key, value) VALUES ('retired_creator_presence_v1', 'complete')").run();
  }
  const adminSessionColumns = new Set(
    (db.prepare("PRAGMA table_info(admin_sessions)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!adminSessionColumns.has("admin_account_id"))
    db.exec("ALTER TABLE admin_sessions ADD COLUMN admin_account_id INTEGER REFERENCES admin_accounts(id) ON DELETE CASCADE");
  if (!adminSessionColumns.has("role"))
    db.exec("ALTER TABLE admin_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'super'");
  if (!adminSessionColumns.has("actor_label"))
    db.exec("ALTER TABLE admin_sessions ADD COLUMN actor_label TEXT NOT NULL DEFAULT '超级管理员'");
  const inboxColumns = new Set(
    (db.prepare("PRAGMA table_info(inbox_messages)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!inboxColumns.has("campaign_id"))
    db.exec("ALTER TABLE inbox_messages ADD COLUMN campaign_id INTEGER REFERENCES platform_notifications(id) ON DELETE SET NULL");
  const notificationColumns = new Set(
    (db.prepare("PRAGMA table_info(platform_notifications)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!notificationColumns.has("sender"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN sender TEXT NOT NULL DEFAULT 'admin'");
  if (!notificationColumns.has("sms_requested_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN sms_requested_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("sms_sent_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN sms_sent_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("sms_failed_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN sms_failed_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("created_by_admin_id"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN created_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL");
  if (!notificationColumns.has("wecom_requested_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN wecom_requested_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("wecom_sent_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN wecom_sent_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("wecom_failed_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN wecom_failed_count INTEGER NOT NULL DEFAULT 0");
  if (!notificationColumns.has("wecom_unbound_count"))
    db.exec("ALTER TABLE platform_notifications ADD COLUMN wecom_unbound_count INTEGER NOT NULL DEFAULT 0");
  const copyColumns = new Set(
    (db.prepare("PRAGMA table_info(copy_generations)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (!copyColumns.has("stage"))
    db.exec("ALTER TABLE copy_generations ADD COLUMN stage TEXT NOT NULL DEFAULT 'queued'");
  if (!copyColumns.has("attempts"))
    db.exec("ALTER TABLE copy_generations ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
  if (!copyColumns.has("next_attempt_at"))
    db.exec("ALTER TABLE copy_generations ADD COLUMN next_attempt_at TEXT");
  if (!copyColumns.has("visual_facts"))
    db.exec("ALTER TABLE copy_generations ADD COLUMN visual_facts TEXT NOT NULL DEFAULT '[]'");
  if (!copyColumns.has("used_tags"))
    db.exec("ALTER TABLE copy_generations ADD COLUMN used_tags TEXT NOT NULL DEFAULT '[]'");
  if (!copyColumns.has("updated_at")) {
    db.exec("ALTER TABLE copy_generations ADD COLUMN updated_at TEXT");
    db.exec("UPDATE copy_generations SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)");
  }
  db.exec(`UPDATE copy_generations SET stage = CASE status
    WHEN 'completed' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    ELSE stage END`);
  db.exec("CREATE INDEX IF NOT EXISTS inbox_campaign_idx ON inbox_messages(campaign_id, recipient_id)");
  db.exec("CREATE INDEX IF NOT EXISTS copy_generations_queue_idx ON copy_generations(status, stage, next_attempt_at, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS creators_manager_idx ON creators(manager_admin_id, created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS creators_inviter_idx ON creators(invited_by_creator_id, created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS creators_rating_idx ON creators(admin_rating, created_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS creators_district_idx ON creators(province, city, district)");

  // 主理人档期与意愿偏好
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id) ON DELETE CASCADE,
      unavailable_dates TEXT NOT NULL DEFAULT '[]',
      weekly_off TEXT NOT NULL DEFAULT '[]',
      excluded_venue_tags TEXT NOT NULL DEFAULT '[]',
      footfall_threshold INTEGER NOT NULL DEFAULT 0,
      excluded_audience_tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 场地方标签库
  db.exec(`
    CREATE TABLE IF NOT EXISTS venue_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK(category IN ('venue','footfall','audience')),
      name TEXT NOT NULL,
      cost INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS venue_tags_category_idx ON venue_tags(category, active, sort_order)");

  // 初始化场地方标签库默认数据
  const venueTagSeed = getDb().prepare("SELECT COUNT(*) as c FROM venue_tags").get() as any;
  if (venueTagSeed.c === 0) {
    const seedTags = [
      {category:'venue', name:'室外无遮挡', cost:3, sort:1},
      {category:'venue', name:'无电源接入', cost:2, sort:2},
      {category:'venue', name:'三层以上无电梯', cost:2, sort:3},
      {category:'venue', name:'无固定摊位', cost:1, sort:4},
      {category:'venue', name:'面积小于10㎡', cost:4, sort:5},
      {category:'venue', name:'无仓储空间', cost:1, sort:6},
      {category:'footfall', name:'不限', cost:0, sort:1},
      {category:'footfall', name:'低于1千', cost:1, sort:2},
      {category:'footfall', name:'低于3千', cost:4, sort:3},
      {category:'footfall', name:'低于5千', cost:7, sort:4},
      {category:'footfall', name:'低于1万', cost:11, sort:5},
      {category:'footfall', name:'低于3万', cost:15, sort:6},
      {category:'audience', name:'纯亲子家庭', cost:2, sort:1},
      {category:'audience', name:'纯写字楼白领', cost:2, sort:2},
      {category:'audience', name:'纯学生群体', cost:2, sort:3},
      {category:'audience', name:'纯长者为主', cost:3, sort:4},
      {category:'audience', name:'禁止宠物入场', cost:1, sort:5},
      {category:'audience', name:'高端奢侈定位', cost:2, sort:6},
    ];
    const ins = getDb().prepare("INSERT INTO venue_tags(category,name,cost,sort_order) VALUES(?,?,?,?)");
    seedTags.forEach(t => ins.run(t.category, t.name, t.cost, t.sort));
  }

  seedCatalog(db);
  seedCreatorTaxonomy(db);
  seedDesignCatalog(db);
}

export function getDb() {
  if (!globalDatabase.__qidengInvitationsDb) {
    const directory = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), "data");
    mkdirSync(directory, { recursive: true });
    const filename = process.env.DATABASE_PATH
      ? path.resolve(process.env.DATABASE_PATH)
      : path.join(directory, "qideng-curated-invitations.sqlite");
    globalDatabase.__qidengInvitationsDb = new DatabaseSync(filename);
    schema(globalDatabase.__qidengInvitationsDb);
  }
  return globalDatabase.__qidengInvitationsDb;
}

export function all<T>(sql: string, ...values: SQLInputValue[]) {
  return (getDb().prepare(sql).all(...values) as Record<string, unknown>[]).map(
    (row) => ({ ...row }) as T,
  );
}

export function one<T>(sql: string, ...values: SQLInputValue[]) {
  const row = getDb().prepare(sql).get(...values) as Record<string, unknown> | undefined;
  return row ? ({ ...row } as T) : null;
}

export function run(sql: string, ...values: SQLInputValue[]) {
  return getDb().prepare(sql).run(...values);
}

export function transaction<T>(operation: () => T) {
  const db = getDb();
  const sequence = (globalDatabase.__qidengTransactionSequence || 0) + 1;
  globalDatabase.__qidengTransactionSequence = sequence;
  const savepoint = `qideng_tx_${sequence}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = operation();
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}

export function newReference(prefix: string) {
  return `${prefix}${new Date().toISOString().slice(2, 10).replaceAll("-", "")}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
