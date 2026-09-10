import JSZip from "jszip";
import { adminPrincipalFromRequest, requireSuperAdmin } from "../../../../lib/auth";
import { audit, listAdminCreators, listCopyGenerations } from "../../../../lib/repository";
import { getObject } from "../../../../lib/storage";
import { formatShanghaiDateTime } from "../../../../lib/datetime";
import { saveTempFile } from "../../../../lib/temp-storage";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function assetKey(url: string | null) {
  if (!url?.startsWith("/api/assets/")) return "";
  return url
    .slice("/api/assets/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "未命名";
}

export async function POST(request: Request) {
  const denied = requireSuperAdmin(request);
  if (denied) return denied;
  const principal = adminPrincipalFromRequest(request)!;
  const data = await request.json().catch(() => ({}));
  const ids = new Set(Array.isArray(data.creatorIds) ? data.creatorIds.map(Number) : []);
  const creators = listAdminCreators().filter((creator) => !ids.size || ids.has(creator.id));
  const overviewGenerations = listCopyGenerations(undefined, 10000);
  const headers = ["用户ID", "品牌/工作室名称", "手机号", "微信ID", "社交账号", "个人邀请码", "注册使用邀请码", "直接邀请来源", "所属子管理员", "注册时间", "省份", "城市", "区", "全部标签", "品牌介绍", "活动计划", "用户分级", "内部备注", "合作意向", "允许合作匹配", "精准邀约-合作目标", "精准邀约-期待场景", "小红书粉丝数", "小红书链接", "抖音粉丝数", "抖音链接", "流程状态", "免费总额度", "免费已使用", "升级总额度", "升级已使用", "最新免费标题", "最新免费正文", "最新升级标题", "最新升级正文"];
  const rows = creators.map((creator) => {
    const generations = overviewGenerations.filter((item) => item.creatorId === creator.id && item.status === "completed");
    const latestFree = generations.find((item) => item.mode === "free");
    const latestUpgrade = generations.find((item) => item.mode === "upgrade");
    return [
      creator.id,
      creator.brandName,
      creator.phone,
      creator.wechat,
      creator.socialAccount,
      creator.inviteCode,
      creator.registeredWithCode,
      creator.invitedByName,
      creator.managerName,
      formatShanghaiDateTime(creator.createdAt),
      creator.province,
      creator.city,
      creator.district,
      creator.tags.map((tag) => `${tag.category}:${tag.label}`).join("、"),
      creator.intro,
      (creator.busyPeriods || []).map((item) => `${item.startDate}~${item.endDate}${item.note ? `(${item.note})` : ""}`).join("、"),
      ({ excellent: "优秀", good: "良好", average: "一般", poor: "差", "": "未分级" } as Record<string, string>)[creator.adminRating],
      creator.adminNote,
      creator.opportunityTypes.join("、"),
      creator.opportunityOptIn ? "是" : "否",
      creator.precisionInviteGoals.join("、"),
      creator.precisionInviteScenes.join("、"),
      creator.xiaohongshuFollowers ?? "",
      creator.xiaohongshuUrl,
      creator.douyinFollowers ?? "",
      creator.douyinUrl,
      creator.onboarding.complete ? "已完成" : `待完成${creator.onboarding.nextStep}`,
      creator.copyQuota.freeLimit,
      creator.copyQuota.freeUsed,
      creator.copyQuota.upgradeLimit,
      creator.copyQuota.upgradeUsed,
      latestFree?.title || "",
      latestFree?.body || "",
      latestUpgrade?.title || "",
      latestUpgrade?.body || "",
    ].map(csvCell).join(",");
  });

  const zip = new JSZip();
  zip.file("汇总表.csv", `\uFEFF${headers.map(csvCell).join(",")}\n${rows.join("\n")}`);
  for (const creator of creators) {
    const folder = zip.folder(`UID${creator.id}_${safeName(creator.brandName || creator.userName)}`)!;
    folder.file(
      "用户资料.txt",
      [
        `用户ID：${creator.id}`,
        `品牌/工作室名称：${creator.brandName}`,
        `手机号：${creator.phone || ""}`,
        `微信ID：${creator.wechat || ""}`,
        `社交账号：${creator.socialAccount || ""}`,
        `个人邀请码：${creator.inviteCode}`,
        `注册使用邀请码：${creator.registeredWithCode}`,
        `邀请来源：${creator.invitedByName}`,
        `所属子管理员：${creator.managerName}`,
        `注册时间：${formatShanghaiDateTime(creator.createdAt)}`,
        `当前省市区：${creator.province} ${creator.city} ${creator.district}`,
        `品牌/个人介绍：${creator.intro}`,
        `全部标签：${creator.tags.map((tag) => `${tag.category}:${tag.label}`).join("、")}`,
        `用户分级：${({ excellent: "优秀", good: "良好", average: "一般", poor: "差", "": "未分级" } as Record<string, string>)[creator.adminRating]}`,
        `内部备注：${creator.adminNote}`,
        `合作意向：${creator.opportunityTypes.join("、")}`,
        `允许合作匹配：${creator.opportunityOptIn ? "是" : "否"}`,
        `精准邀约-合作目标：${creator.precisionInviteGoals.join("、")}`,
        `精准邀约-期待场景：${creator.precisionInviteScenes.join("、")}`,
        `小红书粉丝数：${creator.xiaohongshuFollowers ?? ""}`,
        `小红书链接：${creator.xiaohongshuUrl}`,
        `抖音粉丝数：${creator.douyinFollowers ?? ""}`,
        `抖音链接：${creator.douyinUrl}`,
        `免费生成额度：${creator.copyQuota.freeUsed}/${creator.copyQuota.freeLimit}`,
        `升级生成额度：${creator.copyQuota.upgradeUsed}/${creator.copyQuota.upgradeLimit}`,
      ].join("\n"),
    );
    folder.file(
      "已有约期.txt",
      (creator.busyPeriods || [])
        .map((item) => `${item.startDate} 至 ${item.endDate}\t${item.note || "已有安排"}\t${item.source}`)
        .join("\n") || "当前暂无已确定安排",
    );
    const generations = overviewGenerations.filter((item) => item.creatorId === creator.id && item.status === "completed");
    const latestFree = generations.find((item) => item.mode === "free");
    const latestUpgrade = generations.find((item) => item.mode === "upgrade");
    folder.file(
      "生成文案.txt",
      [
        "【最新免费生成】",
        `标题：${latestFree?.title || ""}`,
        `正文：${latestFree?.body || ""}`,
        `生成时间：${formatShanghaiDateTime(latestFree?.completedAt || latestFree?.createdAt)}`,
        "",
        "【最新升级生成】",
        `标题：${latestUpgrade?.title || ""}`,
        `正文：${latestUpgrade?.body || ""}`,
        `生成时间：${formatShanghaiDateTime(latestUpgrade?.completedAt || latestUpgrade?.createdAt)}`,
      ].join("\n"),
    );
    const logoKey = assetKey(creator.logoUrl);
    if (logoKey) {
      const object = await getObject(logoKey);
      if (object) folder.file(logoKey.endsWith(".png") ? "品牌标识.png" : "品牌标识.jpg", object.body);
    }
    for (const [index, url] of creator.workUrls.entries()) {
      const key = assetKey(url);
      if (!key) continue;
      const object = await getObject(key);
      if (object) folder.file(`代表图片${index + 1}.${key.endsWith(".png") ? "png" : "jpg"}`, object.body);
    }
  }

  audit(principal.label, "export_creators", {
    creatorIds: creators.map((creator) => creator.id),
    count: creators.length,
  });
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });

  // 二维码模式：存临时文件，返回下载链接 token（供手机扫码下载）
  if (data.mode === "qrcode") {
    const fileName = `TDE用户资料_${new Date().toISOString().slice(0, 10)}.zip`;
    const meta = await saveTempFile(Buffer.from(body), fileName);
    return Response.json({
      ok: true,
      token: meta.token,
      downloadUrl: `/api/admin/temp-download/${meta.token}`,
      originalName: meta.originalName,
      size: meta.size,
      expiresAt: meta.expiresAt,
    });
  }

  return new Response(body as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="qideng-creators-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    },
  });
}
