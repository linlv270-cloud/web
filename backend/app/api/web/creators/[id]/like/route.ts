import { NextRequest } from "next/server";
import { all, one, run, transaction } from "../../../../../../lib/database";
import { apiError } from "../../../../../../lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const creatorId = Number(id);
    if (!creatorId) throw new Error("无效的主理人ID");

    const data = await request.json();
    const visitorId = String(data.visitorId || "").slice(0, 64);
    if (!visitorId) throw new Error("缺少访客标识");

    const creator = one<{ id: number }>("SELECT id FROM creators WHERE id = ?", creatorId);
    if (!creator) throw new Error("主理人不存在");

    const existing = one<{ id: number }>(
      "SELECT id FROM creator_likes WHERE creator_id = ? AND visitor_id = ?",
      creatorId, visitorId,
    );

    let liked: boolean;
    if (existing) {
      run("DELETE FROM creator_likes WHERE id = ?", existing.id);
      run("UPDATE creators SET like_count = MAX(0, like_count - 1) WHERE id = ?", creatorId);
      liked = false;
    } else {
      run("INSERT INTO creator_likes (creator_id, visitor_id) VALUES (?, ?)", creatorId, visitorId);
      run("UPDATE creators SET like_count = like_count + 1 WHERE id = ?", creatorId);
      liked = true;
    }

    const updated = one<{ like_count: number }>("SELECT like_count FROM creators WHERE id = ?", creatorId);

    return Response.json({ liked, likeCount: updated?.like_count || 0 });
  } catch (error) {
    return apiError(error);
  }
}
