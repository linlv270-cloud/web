const CANONICAL_PUBLIC_ORIGIN = "https://tde.thedesignexpo.org.cn";

export class PublicOriginConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOriginConfigError";
  }
}

function validateOrigin(
  value: string,
  label: string,
  requireHttps: boolean,
  options: { allowPort?: boolean; allowLoopback?: boolean } = {},
) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PublicOriginConfigError(`${label} 必须是绝对 URL`);
  }
  if (!parsed.hostname)
    throw new PublicOriginConfigError(`${label} 必须包含 hostname`);
  if (requireHttps && parsed.protocol !== "https:")
    throw new PublicOriginConfigError(`${label} 在 production 环境必须使用 HTTPS`);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/")
    throw new PublicOriginConfigError(`${label} 只能包含 origin，不得包含 path、query、hash 或认证信息`);
  if (parsed.port && !options.allowPort)
    throw new PublicOriginConfigError(`${label} 不得包含端口`);
  if (!options.allowLoopback && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase()))
    throw new PublicOriginConfigError(`${label} 不得使用 localhost 或 loopback 地址`);
  return parsed.origin;
}

export function getPublicOrigin(request?: Request, env: NodeJS.ProcessEnv = process.env) {
  const configured = (env.PUBLIC_ORIGIN || "").trim();
  if (configured) {
    const origin = validateOrigin(
      configured,
      "PUBLIC_ORIGIN",
      env.NODE_ENV === "production",
      { allowPort: env.NODE_ENV !== "production" },
    );
    if (env.NODE_ENV === "production" && origin !== CANONICAL_PUBLIC_ORIGIN)
      throw new PublicOriginConfigError(`PUBLIC_ORIGIN 在 production 环境必须为 ${CANONICAL_PUBLIC_ORIGIN}`);
    return origin;
  }

  if (env.NODE_ENV === "production")
    throw new PublicOriginConfigError("production 环境缺少 PUBLIC_ORIGIN，无法生成公开绝对 URL");
  if (!request)
    throw new PublicOriginConfigError("开发/测试环境缺少 request，无法回退生成 origin");
  return new URL(request.url).origin;
}

export function buildPublicPortraitUrl(publicId: string, originOrRequest?: string | Request) {
  if (!/^p-[A-Za-z0-9_-]+$/.test(publicId))
    throw new PublicOriginConfigError("portrait public_id 格式不正确");
  const origin = typeof originOrRequest === "string"
    ? validateOrigin(originOrRequest, "public origin", false, { allowPort: true, allowLoopback: true })
    : getPublicOrigin(originOrRequest);
  return `${origin}/creator.html?portrait=${encodeURIComponent(publicId)}`;
}
