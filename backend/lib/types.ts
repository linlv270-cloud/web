export type TagStatus = "active" | "pending" | "archived" | "retired";
export type AdminRole = "super" | "subadmin";
export type AdminAccountStatus = "pending" | "active" | "suspended" | "rejected";
export type CreatorRating = "" | "excellent" | "good" | "average" | "poor";
export type ServiceIntent = "writer" | "opportunity";
export type WecomBindingStatus = "unbound" | "pending" | "approved" | "rejected" | "disabled" | "error";
export type WecomDeliveryStatus = "pending" | "sent" | "failed" | "unbound" | "disabled" | "not_configured";

export type AdminPrincipal = {
  id: number | null;
  role: AdminRole;
  label: string;
};

export type AdminAccount = {
  id: number;
  name: string;
  phone: string;
  status: AdminAccountStatus;
  inviteCode: string;
  approvedAt: string | null;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  directUsers: number;
  totalUsers: number;
};
export type ApplicationStatus =
  | "draft"
  | "notified"
  | "viewed"
  | "downloaded"
  | "needs_info"
  | "processed"
  | "rejected";

export type Tag = {
  id: number;
  label: string;
  category: string;
  status: TagStatus;
  source?: "creator" | "platform" | "auto";
};

export type Theme = {
  id: number;
  title: string;
  category: string;
  description: string;
  posterUrl: string | null;
  accent: string;
  tagIds: number[];
  active: boolean;
  sortOrder: number;
};

export type BusyPeriod = {
  id: number;
  startDate: string;
  endDate: string;
  note: string;
  source: "manual" | "application" | "event";
  sourceId: number | null;
};

export type CreatorProfile = {
  id: number;
  phone?: string;
  inviteCode: string;
  registeredWithCode: string;
  invitedByCreatorId: number | null;
  invitedByName: string;
  managerAdminId: number | null;
  managerName: string;
  userName: string;
  brandName: string;
  wechat: string;
  intro: string;
  boothDescription: string;
  boothDescriptionConfirmedAt: string | null;
  province: string;
  city: string;
  district: string;
  socialAccount: string;
  slogan: string;
  logoUrl: string | null;
  logoKey?: string;
  productImageKey?: string;
  productImageUrl?: string | null;
  boothImageKey?: string;
  boothImageUrl?: string | null;
  historyImageKey?: string;
  historyImageUrl?: string | null;
  representativeImageKey?: string;
  representativeImageUrl?: string | null;
  workUrls: string[];
  tags: Tag[];
  busyPeriods?: BusyPeriod[];
  noBookings: boolean;
  scheduleConfirmedAt: string | null;
  profileSubmittedAt: string | null;
  tagsSubmittedAt: string | null;
  tagsFirstSubmittedAt: string | null;
  introPopupSeenVersion: string;
  onboarding: OnboardingState;
  profileCompleteness: number;
  applicationLimit: number | null;
  applicationCount: number;
  copyQuota: CopyQuota;
  serviceIntents: ServiceIntent[];
  opportunityTypes: string[];
  opportunityOptIn: boolean;
  precisionInviteGoals: string[];
  precisionInviteScenes: string[];
  xiaohongshuFollowers: number | null;
  xiaohongshuUrl: string;
  douyinFollowers: number | null;
  douyinUrl: string;
  adminRating: CreatorRating;
  adminNote: string;
  activityLimit: number | null;
  replyTimeoutMinutes: number | null;
  suspended: boolean;
  wecomBinding: CreatorWecomBinding;
  createdAt: string;
  updatedAt: string;
};

export type CreatorWecomBinding = {
  id: number | null;
  creatorId: number;
  wecomUserId: string;
  openKfid: string;
  contactUrl: string;
  status: WecomBindingStatus;
  reviewReason: string;
  reviewedBy: string;
  reviewedAt: string | null;
  verifiedAt: string | null;
  lastError: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CopyMode = "free" | "upgrade";
export type CopyGenerationStatus = "processing" | "completed" | "failed";
export type CopyGenerationStage =
  | "queued"
  | "analyzing"
  | "writing"
  | "checking"
  | "retrying"
  | "completed"
  | "failed";

export type CopyQuota = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  upgradeLimit: number;
  upgradeUsed: number;
  upgradeRemaining: number;
};

export type CopyGeneration = {
  id: number;
  creatorId: number;
  creatorName?: string;
  brandName?: string;
  mode: CopyMode;
  status: CopyGenerationStatus;
  stage: CopyGenerationStage;
  attempts: number;
  title: string;
  body: string;
  visualFacts: string[];
  usedTags: string[];
  error: string;
  templateVersion: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
};

export type WriterUiSettings = {
  pageTitle: string;
  pageDescription: string;
  freeTitle: string;
  upgradeTitle: string;
  generateButton: string;
  processingButton: string;
  copyButton: string;
  viewResultButton: string;
  statusLabels: Record<CopyGenerationStage, string>;
  waitMessage: string;
  leaveMessage: string;
  expiryWarning: string;
  tips: string[];
  successDialogTitle: string;
  successDialogBody: string;
  completedNotificationSubject: string;
  completedNotificationBody: string;
  failedNotificationSubject: string;
  failedNotificationBody: string;
};

export type WriterIntroSettings = {
  enabled: boolean;
  version: string;
};

export type RedbookAlgorithmSettings = {
  enabled: boolean;
  name: string;
  version: string;
  systemPrompt: string;
  titleTemplates: string[];
  openingTemplates: string[];
  closingTemplates: string[];
  complianceRules: string;
};

export type TrendTermStatus = "enabled" | "pending" | "expired" | "blacklist";

export type TrendTerm = {
  id: number;
  term: string;
  source: string;
  relatedTags: string[];
  relatedCategories: string[];
  score: number;
  confidence: number;
  risk: number;
  status: TrendTermStatus;
  useCount: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrendSettings = {
  automaticUpdate: boolean;
  updateIntervalHours: number;
  weeklyFullUpdateDay: number;
  dailyCleanupHour: number;
  rotationBatchSize: number;
  baseEnabled: boolean;
  upgradeEnabled: boolean;
  baseMaxTerms: number;
  upgradeMaxTerms: number;
  lastAutoUpdateAt: string | null;
  lastFullUpdateAt: string | null;
};

export type ActivityApplication = {
  id: number;
  reference: string;
  creatorId: number;
  creatorName?: string;
  brandName?: string;
  phone?: string;
  themeId: number;
  themeTitle: string;
  province: string;
  city: string;
  startDate: string;
  endDate: string;
  participation: string;
  tags: Tag[];
  note: string;
  hasConflict: boolean;
  status: ApplicationStatus;
  snapshot?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type InboxMessage = {
  id: number;
  kind: "invitation" | "application" | "review" | "schedule" | "system";
  subject: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export type FieldRule = {
  enabled: boolean;
  required: boolean;
};

export type OnboardingState = {
  profileSubmitted: boolean;
  scheduleSubmitted: boolean;
  lightsSubmitted: boolean;
  complete: boolean;
  nextStep: "profile" | "schedule" | "lights" | "complete";
};

export type HomeShowcaseCard = {
  enabled: boolean;
  index: string;
  category: string;
  eyebrow: string;
  title: string;
  footer: string;
  background: string;
  foreground: string;
  imageUrl: string | null;
};

export type HomeShowcaseSettings = {
  enabled: boolean;
  cards: HomeShowcaseCard[];
};

export type HomeCriterion = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
};

export type InviteSharingSettings = {
  heading: string;
  description: string;
  buttonText: string;
  buttonIcon: string;
  template: string;
  joinUrl: string;
};

export type SmsNotificationType = {
  key: string;
  label: string;
  enabled: boolean;
  smsEnabled: boolean;
  templateCode: string;
  linkPath: string;
  sortOrder: number;
};

export type SmsSettings = {
  enabled: boolean;
  signName: string;
  verificationTemplateCode: string;
  notificationTypes: SmsNotificationType[];
};

export type PlatformSettings = {
  productName: string;
  headline: string;
  subheadline: string;
  contactText: string;
  profileExample: string;
  scheduleTitle: string;
  scheduleDescription: string;
  lightsDescription: string;
  writerUi: WriterUiSettings;
  writerIntro: WriterIntroSettings;
  uiText: Record<string, string>;
  homeShowcase: HomeShowcaseSettings;
  homeCriteria: HomeCriterion[];
  inviteSharing: InviteSharingSettings;
  inviteContactText: string;
  sms: SmsSettings;
  navigation: Record<string, string>;
  navigationIcons: Record<string, string>;
  fieldRules: Record<string, FieldRule>;
};

export type InviteCode = {
  id: number;
  code: string;
  source: string;
  active: boolean;
  createdAt: string;
};

export type PlatformNotificationRecipient = {
  id: number;
  name: string;
  phone: string;
  readAt: string | null;
  wecomStatus: WecomDeliveryStatus | null;
  wecomError: string;
};

export type PlatformNotification = {
  id: number;
  source: "platform" | "creator_search";
  sender: string;
  subject: string;
  body: string;
  filterSnapshot: Record<string, unknown>;
  requestedCount: number;
  sentCount: number;
  failedCount: number;
  smsRequestedCount: number;
  smsSentCount: number;
  smsFailedCount: number;
  wecomRequestedCount: number;
  wecomSentCount: number;
  wecomFailedCount: number;
  wecomUnboundCount: number;
  readCount: number;
  recipients: PlatformNotificationRecipient[];
  createdAt: string;
};

export type AdminOverview = {
  admin: AdminPrincipal;
  adminAccounts: AdminAccount[];
  creators: CreatorProfile[];
  generations: CopyGeneration[];
  tags: Tag[];
  inviteCodes: InviteCode[];
  notifications: PlatformNotification[];
  metrics: {
    creators: number;
    pendingTags: number;
  };
  settings: PlatformSettings;
};

export type VisualizationUser = {
  id: number;
  name: string;
  phone: string;
  accessScope: "all" | "province" | "city";
  province: string;
  city: string;
  unit: string;
  position: string;
  note: string;
  status: "active" | "suspended";
  expiresAt: number | null;
  createdAt: string;
  updatedAt: string;
};

export type VisualizationAccessEvent = {
  id: number;
  vizUserId: number;
  action: "open" | "extend" | "restore" | "close";
  daysDelta: number;
  beforeExpiresAt: number | null;
  afterExpiresAt: number | null;
  operatorAdminId: number | null;
  note: string;
  createdAt: string;
};

// ===== 设计策划模块（在线矢量海报）=====

export type DesignSolarTerm = {
  id: number;
  name: string;
  month_day: string;
  theme_hint: string;
  status: string;
};

export type DesignTagCategory = {
  id: number;
  key: string;
  name: string;
  hint: string;
  pick_count: number;
  required: number;
  status: string;
  sort_order: number;
};

export type DesignTag = {
  id: number;
  category_key: string;
  value: string;
  status: "active" | "archived";
  sort_order: number;
};

export type DesignApiKey = {
  id: number;
  operator_name: string;
  base_url: string;
  /** 密文存储，任何 API 均不返回明文 */
  api_key_encrypted: string;
  model: string;
  enabled: number;
  note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** 抽卡会话：一个节气任务（如「立春·市集海报」），内含多次点击产生的草稿版本 */
export type DesignSession = {
  id: number;
  title: string;
  solar_term_id: number;
  status: "active" | "confirmed" | "archived";
  selected_draft_id: number | null;
  operator_id: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type DesignDraft = {
  id: number;
  session_id: number;
  version: number;
  tag_combo: Array<{ category: string; category_name: string; value: string }>;
  prompt_text: string;
  brief_json: DesignBrief;
  svg: string;
  svg_size: number;
  style_key: string;
  grid_key: string;
  palette: string[];
  status: "generated" | "selected" | "failed";
  error: string;
  created_by: string;
  created_at: string;
};

/** 结构化设计描述：AI 输出、SVG 渲染引擎执行 */
export type DesignBrief = {
  theme: string;
  slogan: string;
  subtitle: string;
  style_key: string;
  grid_key: string;
  palette: { background: string; primary: string; accent: string; text: string };
  title_font: string;
  body_font: string;
  elements: Array<{
    kind: "title" | "subtitle" | "slogan" | "body" | "tde" | "decor" | "badge";
    text: string;
    font: string;
    size: number;
    color: string;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    rotate?: number;
  }>;
  note: string;
};
