import { apiError } from "../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import {
  claimPortrait,
  getPortraitManagement,
  updatePortrait,
} from "../../../../lib/portrait";

function creatorId(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return principal.actorId;
}

export async function GET(request: Request) {
  const id = creatorId(request);
  if (id instanceof Response) return id;
  try {
    return Response.json(getPortraitManagement(id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const id = creatorId(request);
  if (id instanceof Response) return id;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "save") {
      return Response.json(updatePortrait(id, {
        displayTitleOverride: body.displayTitleOverride,
        representativeLineOverride: body.representativeLineOverride,
        heroMediaKey: body.heroMediaKey,
        galleryMediaKeys: body.galleryMediaKeys,
        visibility: body.visibility,
      }), { headers: { "cache-control": "no-store" } });
    }
    if (action === "claim") {
      return Response.json(claimPortrait(id), {
        headers: { "cache-control": "no-store" },
      });
    }
    return Response.json({ error: "当前页面版本与服务不一致，请刷新页面后重试" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
