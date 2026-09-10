import { apiError } from "../../../../lib/http";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import { createDraw, revealDraw } from "../../../../lib/mini-program";
import { rateLimit } from "../../../../lib/security";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, "mini-draw", 20, 10 * 60000);
    if (limited) return limited;
    const data = await request.json();
    const principal = miniPrincipalFromRequest(request);
    return Response.json(
      { draw: createDraw(data, principal?.actorType === "consumer" ? principal.actorId : null) },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(
      { draw: revealDraw(url.searchParams.get("reference") || "", url.searchParams.get("guestId") || "") },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

