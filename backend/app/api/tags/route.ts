import { creatorIdFromRequest } from "../../../lib/auth";
import { tagCategoryNames } from "../../../lib/catalog";
import { apiError } from "../../../lib/http";
import { claimTag, listTags, removeTag, setBoothDescription, submitTags } from "../../../lib/repository";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  const tags = listTags();
  return Response.json(
    { tags: scope === "all" ? tags : tags.filter((tag) => tagCategoryNames.includes(tag.category)) },
    { headers: { "cache-control": scope === "all" ? "no-store" : "public, max-age=60, stale-while-revalidate=300" } },
  );
}
export async function POST(request: Request) {
  try {
    const id = creatorIdFromRequest(request);
    if (!id) return Response.json({ error: "请先登录" }, { status: 401 });
    const data = await request.json();
    const creator = data.action === "submit"
      ? submitTags(id)
      : data.action === "describe"
        ? setBoothDescription(id, data.description)
        : data.action === "skipDescription"
          ? setBoothDescription(id, "", true)
          : claimTag(id, data);
    return Response.json({ creator });
  }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try { const id = creatorIdFromRequest(request); if (!id) return Response.json({ error: "请先登录" }, { status: 401 }); const data = await request.json(); return Response.json({ creator: removeTag(id, Number(data.tagId)) }); }
  catch (error) { return apiError(error); }
}
