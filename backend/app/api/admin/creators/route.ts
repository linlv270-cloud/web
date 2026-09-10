import { adminCanManageCreator, adminPrincipalFromRequest, requireAdmin } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { assignCreatorTag, audit, createManagedCreator, generateCreatorClaimCode, getCreator, revokeCreatorClaimCodes, searchCreators, setApplicationLimit, setManagedCreatorSuspended, updateCreatorImages, updateManagedCreatorDetails } from "../../../../lib/repository";

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    if (data.action === "create") {
      const managerId = principal.role === "subadmin" ? principal.id : Number(data.managerAdminId || 0);
      if (!managerId) throw new Error("请选择所属子管理员");
      const creator = createManagedCreator(managerId, data, principal.label);
      const claim = generateCreatorClaimCode(creator.id, principal.label);
      return Response.json({ creator, claim }, { status: 201 });
    }
    return Response.json({ creators: searchCreators(data, principal.role === "subadmin" ? principal.id : null) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const principal = adminPrincipalFromRequest(request)!;
    const data = await request.json();
    const creatorId = Number(data.creatorId);
    if (!adminCanManageCreator(request, creatorId))
      return Response.json({ error: "该账号不能管理此用户" }, { status: 403 });
    if (data.action === "setLimit") {
      if (principal.role !== "super") return Response.json({ error: "该账号没有额度管理权限" }, { status: 403 });
      return Response.json({ creator: setApplicationLimit(Number(data.creatorId), data.limit) });
    }
    if (data.action === "updateImages") {
      const before = getCreator(creatorId);
      const creator = updateCreatorImages(creatorId, {
        representativeImageKey: data.representativeImageKey !== undefined ? String(data.representativeImageKey || "") : undefined,
        logoImageKey: data.logoImageKey !== undefined ? String(data.logoImageKey || "") : undefined,
        productImageKey: data.productImageKey !== undefined ? String(data.productImageKey || "") : undefined,
        boothImageKey: data.boothImageKey !== undefined ? String(data.boothImageKey || "") : undefined,
        historyImageKey: data.historyImageKey !== undefined ? String(data.historyImageKey || "") : undefined,
      });
      audit(principal.label, "managed_creator_images_update", {
        creatorId,
        before: {
          representativeImageKey: before?.representativeImageKey || "",
          logoImageKey: before?.logoKey || "",
          productImageKey: before?.productImageKey || "",
          boothImageKey: before?.boothImageKey || "",
          historyImageKey: before?.historyImageKey || "",
        },
        after: {
          representativeImageKey: creator.representativeImageKey || "",
          logoImageKey: creator.logoKey || "",
          productImageKey: creator.productImageKey || "",
          boothImageKey: creator.boothImageKey || "",
          historyImageKey: creator.historyImageKey || "",
        },
      });
      return Response.json({ creator });
    }
    if (data.action === "updateDetails")
      return Response.json({ creator: updateManagedCreatorDetails(creatorId, data, principal.label) });
    if (data.action === "setSuspended")
      return Response.json({ creator: setManagedCreatorSuspended(creatorId, data.suspended === true, principal.label) });
    if (data.action === "generateClaimCode")
      return Response.json({ claim: generateCreatorClaimCode(creatorId, principal.label) });
    if (data.action === "revokeClaimCodes")
      return Response.json({ claim: revokeCreatorClaimCodes(creatorId, principal.label) });
    return Response.json({
      creator: assignCreatorTag(creatorId, Number(data.tagId), data.action === "removeTag"),
    });
  } catch (error) {
    return apiError(error);
  }
}
