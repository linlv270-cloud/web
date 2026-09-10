import { creatorIdFromRequest } from "../../../lib/auth";
import { apiError } from "../../../lib/http";
import {
  addBusyPeriod,
  confirmSchedule,
  confirmScheduleForGeneration,
  confirmNoBookings,
  getCreator,
  removeBusyPeriod,
  setNoBookings,
} from "../../../lib/repository";

export async function GET(request: Request) {
  const creatorId = creatorIdFromRequest(request);
  return creatorId
    ? Response.json({ creator: getCreator(creatorId) })
    : Response.json({ error: "请先登录" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const data = await request.json();
    if (data.action === "confirmNone")
      return Response.json({ creator: confirmNoBookings(creatorId) });
    if (data.action === "selectNone")
      return Response.json({ creator: setNoBookings(creatorId, data.selected !== false) });
    if (data.action === "confirm")
      return Response.json({ creator: confirmSchedule(creatorId) });
    if (data.action === "confirmForGeneration")
      return Response.json({ creator: confirmScheduleForGeneration(creatorId) });
    return Response.json({
      creator: addBusyPeriod(
        creatorId,
        String(data.startDate || ""),
        String(data.endDate || ""),
        String(data.note || ""),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const creatorId = creatorIdFromRequest(request);
    if (!creatorId) return Response.json({ error: "请先登录" }, { status: 401 });
    const data = await request.json();
    return Response.json({ creator: removeBusyPeriod(creatorId, Number(data.id)) });
  } catch (error) {
    return apiError(error);
  }
}
