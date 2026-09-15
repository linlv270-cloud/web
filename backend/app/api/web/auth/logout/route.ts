import { run } from "../../../../../lib/database";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (token) run("DELETE FROM mini_sessions WHERE token = ?", token);
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
