import { adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { listProjectNotifications, markAllProjectNotificationsRead, markProjectNotificationRead } from "../../../../lib/execution-project-notifications";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  return Response.json(listProjectNotifications(adminPrincipalFromRequest(request)!, {
    unreadOnly: url.searchParams.get("unreadOnly") === "1",
    limit: Number(url.searchParams.get("limit") || 30),
  }), { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const principal = adminPrincipalFromRequest(request)!;
  const body = await request.json().catch(() => ({})) as { notificationId?: number; all?: boolean };
  const changed = body.all
    ? markAllProjectNotificationsRead(principal)
    : markProjectNotificationRead(Number(body.notificationId), principal) ? 1 : 0;
  return Response.json({ changed });
}
