import type { CreatorProfile, Tag } from "./types";

export type MiniActorType = "consumer" | "creator";

export type ReviewEntityType = "creator_application" | "project" | "operation_request";

export type ReviewMessage = {
  id: number;
  threadId: number;
  senderType: "creator" | "admin" | "system";
  senderId: number | null;
  senderLabel: string;
  body: string;
  createdAt: string;
};

export type ReviewThread = {
  id: number;
  reference: string;
  entityType: ReviewEntityType;
  entityId: number;
  creatorId: number;
  creatorName: string;
  subject: string;
  status: "open" | "resolved";
  creatorUnreadCount: number;
  adminUnreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: ReviewMessage[];
};

export type MiniPrincipal = {
  actorType: MiniActorType;
  actorId: number;
};

export type MiniCreatorApplicationFieldKey =
  | "brandName"
  | "location"
  | "representativeImage"
  | "intro"
  | "tags"
  | "customTags"
  | "offlineExperience"
  | "busyPeriods";

export type MiniCreatorApplicationFieldRule = {
  enabled: boolean;
  required: boolean;
  label: string;
  hint: string;
};

export type MiniProgramSettings = {
  enabled: boolean;
  creatorInvitationsEnabled: boolean;
  defaultActivityLimit: number;
  defaultReplyTimeoutMinutes: number;
  openingCopy: string;
  slogan: string;
  drawButton: string;
  contactCopy: string;
  heroImageUrl: string | null;
  loadingImageUrl: string | null;
  revealImageUrl: string | null;
  creatorApplicationFields: Record<MiniCreatorApplicationFieldKey, MiniCreatorApplicationFieldRule>;
  updatedAt: string;
};

export type MiniConsumer = {
  id: number;
  nickname: string;
  avatarUrl: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  createdAt: string;
};

export type MiniActivityStatus = "draft" | "published" | "paused" | "archived";
export type CreatorApplicationStatus = "pending" | "needs_changes" | "active" | "rejected";

export type CreatorApplicationAdminItem = {
  creatorId: number;
  consumerId: number;
  status: CreatorApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string;
  reviewNote: string;
  revision: number;
  brandName: string;
  intro: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  registeredWithCode: string;
  invitedByName: string;
  managerName: string;
  representativeImageUrl: string | null;
  logoImageUrl: string | null;
  workspaceEnabled: boolean;
  tags: Tag[];
  customTags: Array<{ category: string; label: string }>;
  opportunityTypes: string[];
  busyPeriods: Array<{ startDate: string; endDate: string; note: string }>;
  noBookings: boolean;
  publicAuthorized: boolean;
  consentAt: string | null;
  phonePublicAuthorized: boolean;
  phoneConsentAt: string | null;
  reviewThreadId: number | null;
};

export type MiniActivity = {
  id: number;
  reference: string;
  creatorId: number;
  creatorName: string;
  creatorIntro: string;
  title: string;
  shortIntro: string;
  description: string;
  imageUrl: string;
  province: string;
  city: string;
  district: string;
  address: string;
  startDate: string;
  endDate: string;
  noPlan: boolean;
  acceptsQidengDuringActivity: boolean;
  status: MiniActivityStatus;
  tags: Tag[];
  viewCount: number;
  consultationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DrawResult = {
  reference: string;
  activity: MiniActivity;
  createdAt: string;
};

export type ConsultationKind = "creator" | "official";
export type ConsultationStatus = "open" | "waiting" | "resolved" | "closed";

export type ConsultationMessage = {
  id: number;
  senderType: "consumer" | "creator" | "admin";
  body: string;
  createdAt: string;
};

export type ConsultationThread = {
  id: number;
  reference: string;
  kind: ConsultationKind;
  consumerId: number;
  consumerName: string;
  creatorId: number | null;
  creatorName: string;
  activityId: number | null;
  workshopProjectId: number | null;
  activityTitle: string;
  status: ConsultationStatus;
  subject: string;
  replyTimeoutMinutes: number;
  creatorUnreadCount: number;
  consumerUnreadCount: number;
  overdue: boolean;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages?: ConsultationMessage[];
};

export type MiniCreatorHome = {
  creator: CreatorProfile;
  approvedProjectTagIds: number[];
  activities: MiniActivity[];
  projects: WorkshopProject[];
  applicationStatus: CreatorApplicationStatus | "legacy";
  applicationReviewNote: string;
  applicationSubmittedAt: string;
  contactPhoneMasked: string;
  phonePublicAuthorized: boolean;
  phoneConsentAt: string | null;
  contactChannels: CreatorContactChannel[];
  replyUnreadCount: number;
  noticeUnreadCount: number;
  reviewUnreadCount: number;
  reviewThreads: ReviewThread[];
  operationRequests: ProjectOperationRequest[];
  activityLimit: number;
  replyTimeoutMinutes: number;
};

export type VenueStatus = "draft" | "published" | "paused" | "archived";
export type KitStatus = "draft" | "published" | "paused" | "archived";
export type WorkshopProjectStatus = "draft" | "pending" | "published" | "paused" | "archived" | "rejected";

export type WorkshopVenue = {
  id: number;
  reference: string;
  name: string;
  kind: "store" | "popup" | "partner" | "event";
  province: string;
  city: string;
  district: string;
  businessArea: string;
  address: string;
  routeHint: string;
  latitude: number | null;
  longitude: number | null;
  coverUrl: string | null;
  status: VenueStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type VenueHour = {
  id: number;
  venueId: number;
  weekday: number | null;
  dateOverride: string;
  openTime: string;
  closeTime: string;
  closed: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkshopKit = {
  id: number;
  reference: string;
  title: string;
  subtitle: string;
  description: string;
  coverUrl: string | null;
  galleryUrls: string[];
  priceCents: number;
  ageRange: string;
  durationMinutes: number;
  difficulty: "easy" | "medium" | "hard";
  messLevel: "low" | "medium" | "high";
  guidanceType: "self" | "staff" | "video" | "creator";
  safetyNotes: string;
  tags: Tag[];
  status: KitStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type KitGuide = {
  id: number;
  kitId: number;
  stepOrder: number;
  title: string;
  body: string;
  mediaUrl: string | null;
  videoUrl: string;
  safetyLevel: "normal" | "notice" | "warning";
  createdAt: string;
  updatedAt: string;
};

export type VenueRule = {
  id: number;
  venueId: number;
  stepOrder: number;
  title: string;
  body: string;
  linkUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type VenueKit = {
  venueId: number;
  venueName: string;
  kitId: number;
  kitTitle: string;
  available: boolean;
  updatedAt: string;
};

export type SupportTicket = {
  id: number;
  reference: string;
  consumerId: number | null;
  venueId: number | null;
  venueName: string;
  kitId: number | null;
  kitTitle: string;
  subject: string;
  body: string;
  status: "open" | "processing" | "resolved" | "closed";
  handledBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PublishedVenueKit = VenueKit & {
  venue: WorkshopVenue;
  kit: WorkshopKit;
  openingLabel: string;
  openNow: boolean;
};

export type ProjectSchedule = {
  id: number;
  projectId: number;
  availableDate: string;
  startTime: string;
  endTime: string;
  status: "open" | "closed";
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectOperationDraft = {
  requestFirstLaunch: boolean;
  firstLaunchReason: string;
  firstLaunchAcknowledged: boolean;
  requestLimited: boolean;
  limitedReason: string;
  limitedAcknowledged: boolean;
};

export type WorkshopProject = {
  id: number;
  reference: string;
  creatorId: number;
  creatorName: string;
  oneLiner: string;
  title: string;
  description: string;
  coverUrl: string | null;
  coverSource: "project" | "representative" | "none";
  province: string;
  city: string;
  district: string;
  addressHint: string;
  startDate: string;
  endDate: string;
  noPlan: boolean;
  minPeople: number;
  maxPeople: number;
  priceCents: number;
  durationMinutes: number;
  primaryCategoryTagId: number | null;
  primaryCategoryLabel: string;
  ageRange: string;
  difficulty: "easy" | "medium" | "hard";
  safetyNotes: string;
  operationDraft: ProjectOperationDraft;
  selectedForDisplay: boolean;
  status: WorkshopProjectStatus;
  reviewNote: string;
  sortOrder: number;
  viewCount: number;
  consultationCount: number;
  publishedAt: string | null;
  schedules: ProjectSchedule[];
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectOperationRequest = {
  id: number;
  projectId: number;
  projectTitle: string;
  maxPeople: number;
  creatorId: number;
  creatorName: string;
  requestType: "first_launch" | "limited";
  ruleAcknowledged: boolean;
  reason: string;
  quantityNote: string;
  startsAt: string | null;
  endsAt: string | null;
  status: "pending" | "approved" | "rejected" | "expired" | "withdrawn";
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string | null;
  reviewThreadId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatorContactChannel = {
  id: number;
  creatorId: number;
  projectId: number | null;
  channelType: "wecom" | "wechat" | "mini_consult" | "phone" | "other";
  label: string;
  contactValue: string;
  corpId: string;
  qrUrl: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HomepageBanner = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkType: "none" | "kit" | "venue" | "project" | "topic" | "url";
  linkValue: string;
  city: string;
  enabled: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HomepageSlot = {
  id: number;
  slotKey: "limited" | "new_today" | "first_launch" | "featured";
  contentType: "kit" | "venue" | "project" | "topic";
  contentId: number;
  titleOverride: string;
  enabled: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdByCreatorId: number | null;
  reviewedByAdmin: string;
  reviewStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type WorkshopDetailLink = {
  linkType: "none" | "kit" | "venue" | "project" | "topic" | "url";
  linkValue: string;
  path: string;
};

export type WorkshopProjectDetail = {
  project: WorkshopProject;
  creatorPublic: {
    id: number;
    name: string;
    intro: string;
    imageUrl: string | null;
    logoUrl: string | null;
    tags: Tag[];
    opportunityTypes: string[];
  };
  contactChannels: CreatorContactChannel[];
  recommendedContact: CreatorContactChannel | null;
  phoneContact: {
    available: boolean;
    maskedPhone: string;
  } | null;
};
