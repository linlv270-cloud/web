import { all, one, run } from "./database";
import { cleanText } from "./security";
import type { WecomDeliveryStatus } from "./types";
import { sendWecomApplicationText, wecomRuntimeStatus } from "./wecom";

type DeliveryRecipient = {
  creator_id: number;
  wecom_user_id: string | null;
  binding_status: string | null;
};

function saveDelivery(
  campaignId: number,
  creatorId: number,
  userId: string,
  status: WecomDeliveryStatus,
  providerMessageId = "",
  error = "",
) {
  run(
    `INSERT INTO wecom_notification_deliveries(
      campaign_id, creator_id, wecom_user_id, status, provider_message_id, error,
      attempted_at, sent_at
     ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT(campaign_id, creator_id) DO UPDATE SET wecom_user_id = excluded.wecom_user_id,
       status = excluded.status, provider_message_id = excluded.provider_message_id, error = excluded.error,
       attempted_at = CURRENT_TIMESTAMP,
       sent_at = CASE WHEN excluded.status = 'sent' THEN CURRENT_TIMESTAMP ELSE wecom_notification_deliveries.sent_at END,
       updated_at = CURRENT_TIMESTAMP`,
    campaignId,
    creatorId,
    userId,
    status,
    cleanText(providerMessageId, 180),
    cleanText(error, 300),
    status,
  );
}

async function inChunks<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}

export async function deliverPlatformNotificationToWecom(campaignId: number) {
  const campaign = one<{ subject: string; body: string }>(
    "SELECT subject, body FROM platform_notifications WHERE id = ?",
    campaignId,
  );
  if (!campaign) throw new Error("平台通知不存在");
  const recipients = all<DeliveryRecipient>(
    `SELECT im.recipient_id AS creator_id, b.wecom_user_id, b.status AS binding_status
     FROM inbox_messages im
     LEFT JOIN creator_wecom_bindings b ON b.creator_id = im.recipient_id
     WHERE im.campaign_id = ? ORDER BY im.recipient_id`,
    campaignId,
  );
  const runtime = wecomRuntimeStatus();
  const content = `【${campaign.subject}】\n${campaign.body}\n\n请在TDE小程序“通知”中查看完整记录。`;
  await inChunks(recipients, 6, async (recipient) => {
    const userId = String(recipient.wecom_user_id || "");
    if (!recipient.binding_status || !userId) {
      saveDelivery(campaignId, recipient.creator_id, userId, "unbound", "", "尚未绑定企业微信成员");
      return;
    }
    if (recipient.binding_status === "disabled" || recipient.binding_status === "rejected") {
      saveDelivery(campaignId, recipient.creator_id, userId, "disabled", "", "企业微信绑定已停用或未通过");
      return;
    }
    if (recipient.binding_status !== "approved") {
      saveDelivery(campaignId, recipient.creator_id, userId, "unbound", "", "企业微信绑定尚未完成");
      return;
    }
    if (!runtime.applicationConfigured) {
      saveDelivery(campaignId, recipient.creator_id, userId, "not_configured", "", "企业微信应用消息尚未完成服务器配置");
      return;
    }
    saveDelivery(campaignId, recipient.creator_id, userId, "pending");
    try {
      const messageId = await sendWecomApplicationText(userId, content);
      saveDelivery(campaignId, recipient.creator_id, userId, "sent", messageId);
    } catch (error) {
      saveDelivery(
        campaignId,
        recipient.creator_id,
        userId,
        "failed",
        "",
        error instanceof Error ? error.message : "企业微信消息发送失败",
      );
    }
  });
  const counts = all<{ status: WecomDeliveryStatus; count: number }>(
    `SELECT status, COUNT(*) AS count FROM wecom_notification_deliveries
     WHERE campaign_id = ? GROUP BY status`,
    campaignId,
  );
  const count = (statuses: WecomDeliveryStatus[]) => counts
    .filter((item) => statuses.includes(item.status))
    .reduce((total, item) => total + Number(item.count || 0), 0);
  const sent = count(["sent"]);
  const failed = count(["failed", "not_configured"]);
  const unbound = count(["unbound", "disabled"]);
  run(
    `UPDATE platform_notifications SET wecom_requested_count = ?, wecom_sent_count = ?,
     wecom_failed_count = ?, wecom_unbound_count = ? WHERE id = ?`,
    recipients.length,
    sent,
    failed,
    unbound,
    campaignId,
  );
  return { requested: recipients.length, sent, failed, unbound };
}
