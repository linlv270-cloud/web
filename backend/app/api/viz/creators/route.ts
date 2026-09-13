import { apiError } from "../../../../lib/http";
import { searchCreators } from "../../../../lib/repository";
import { getVisualizationSession } from "../../../../lib/visualization";

const COOKIE_NAME = "viz_session";

function getTokenFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : "";
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    const user = token ? getVisualizationSession(token) : null;
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

    const data = await request.json();

    // 根据权限模式限制筛选范围
    const restrictedFilters = { ...data };
    if (user.accessScope === "city" && user.city) {
      restrictedFilters.province = user.province;
      restrictedFilters.city = user.city;
    } else if (user.accessScope === "province" && user.province) {
      restrictedFilters.province = user.province;
    }
    // all 模式：不限制省市
    delete restrictedFilters.district;

    // 可视化用户不允许按用户分级、流程状态、用户状态、子管理员筛选
    delete restrictedFilters.rating;
    delete restrictedFilters.flowStatus;
    delete restrictedFilters.accountStatus;
    delete restrictedFilters.managerAdminId;
    delete restrictedFilters.keyword;
    delete restrictedFilters.inviteCode;

    const creators = searchCreators(restrictedFilters, null);

    // 只返回可视化需要的字段，不返回敏感信息
    const safeCreators = creators.map((creator) => ({
      id: creator.id,
      userName: creator.userName,
      brandName: creator.brandName,
      intro: creator.intro,
      boothDescription: creator.boothDescription,
      province: creator.province,
      city: creator.city,
      district: creator.district,
      logoUrl: creator.logoUrl,
      workUrls: creator.workUrls,
      tags: creator.tags.filter((tag) => tag.status === "active"),
      opportunityTypes: creator.opportunityTypes,
      busyPeriods: creator.busyPeriods,
      noBookings: creator.noBookings,
      scheduleConfirmedAt: creator.scheduleConfirmedAt,
    }));

    return Response.json({ creators: safeCreators });
  } catch (error) {
    return apiError(error);
  }
}
