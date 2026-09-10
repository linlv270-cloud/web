import { creatorIdFromRequest } from "../../../lib/auth";
import { getInbox, markInboxRead } from "../../../lib/repository";

export async function GET(request: Request) { const id = creatorIdFromRequest(request); if (!id) return Response.json({ error: "请先登录" }, { status: 401 }); const messages = getInbox(id); return Response.json({ messages, unreadCount: messages.filter((item) => !item.readAt).length }); }
export async function PATCH(request: Request) { const id = creatorIdFromRequest(request); if (!id) return Response.json({ error: "请先登录" }, { status: 401 }); const data = await request.json().catch(() => ({})); return Response.json({ messages: markInboxRead(id, Number(data.id)) }); }
