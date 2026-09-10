import { all, one, run } from "../../../../lib/database";
import { miniPrincipalFromRequest } from "../../../../lib/mini-auth";
import { markCreatorSection } from "../../../../lib/legal";

function requireCreator(request: Request) {
  const principal = miniPrincipalFromRequest(request);
  if (!principal || principal.actorType !== "creator")
    return Response.json({ error: "请先登录" }, { status: 401, headers: { "cache-control": "no-store" } });
  return null;
}

export async function GET(request: Request) {
  const denied = requireCreator(request);
  if (denied) return denied;
  const creatorId = miniPrincipalFromRequest(request)!.actorId;

  const pref = one<{
    unavailable_dates: string;
    weekly_off: string;
    excluded_venue_tags: string;
    footfall_threshold: number;
    excluded_audience_tags: string;
    updated_at: string;
  }>(
    "SELECT unavailable_dates, weekly_off, excluded_venue_tags, footfall_threshold, excluded_audience_tags, updated_at FROM creator_preferences WHERE creator_id = ?",
    creatorId,
  );

  if (!pref) {
    return Response.json({
      unavailableDates: [],
      weeklyOff: [],
      excludedVenueTags: [],
      footfallThreshold: 0,
      excludedAudienceTags: [],
      saved: false,
      updatedAt: null,
    });
  }

  return Response.json({
    unavailableDates: JSON.parse(pref.unavailable_dates || '[]'),
    weeklyOff: JSON.parse(pref.weekly_off || '[]'),
    excludedVenueTags: JSON.parse(pref.excluded_venue_tags || '[]'),
    footfallThreshold: pref.footfall_threshold || 0,
    excludedAudienceTags: JSON.parse(pref.excluded_audience_tags || '[]'),
    saved: true,
    updatedAt: pref.updated_at,
  });
}

export async function POST(request: Request) {
  const denied = requireCreator(request);
  if (denied) return denied;
  const creatorId = miniPrincipalFromRequest(request)!.actorId;

  const body = await request.json();
  const {
    unavailableDates = [],
    weeklyOff = [],
    excludedVenueTags = [],
    footfallThreshold = 0,
    excludedAudienceTags = [],
  } = body;

  const existing = one<{ id: number }>("SELECT id FROM creator_preferences WHERE creator_id = ?", creatorId);

  if (existing) {
    run(
      `UPDATE creator_preferences SET
        unavailable_dates = ?, weekly_off = ?, excluded_venue_tags = ?,
        footfall_threshold = ?, excluded_audience_tags = ?, updated_at = CURRENT_TIMESTAMP
       WHERE creator_id = ?`,
      JSON.stringify(unavailableDates),
      JSON.stringify(weeklyOff),
      JSON.stringify(excludedVenueTags),
      footfallThreshold,
      JSON.stringify(excludedAudienceTags),
      creatorId,
    );
  } else {
    run(
      `INSERT INTO creator_preferences
        (creator_id, unavailable_dates, weekly_off, excluded_venue_tags, footfall_threshold, excluded_audience_tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      creatorId,
      JSON.stringify(unavailableDates),
      JSON.stringify(weeklyOff),
      JSON.stringify(excludedVenueTags),
      footfallThreshold,
      JSON.stringify(excludedAudienceTags),
    );
  }

  markCreatorSection(creatorId, "schedule");

  return Response.json({ success: true });
}
