let cachedToken = "";
let tokenExpiresAt = 0;

export async function getWechatMiniAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const appId = process.env.WECHAT_MINI_APP_ID || "";
  const secret = process.env.WECHAT_MINI_APP_SECRET || "";
  if (!appId || !secret) throw new Error("微信小程序服务端凭证尚未配置");
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json() as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
  if (!response.ok || !data.access_token)
    throw new Error(`微信服务端授权失败：${data.errmsg || data.errcode || response.status}`);
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000;
  return cachedToken;
}

/**
 * 微信小程序文本内容安全检测
 * @param content 要检测的文本内容
 * @returns true 表示内容正常，false 表示内容违规
 */
export async function checkTextContent(content: string): Promise<boolean> {
  if (!content || !content.trim()) return true;
  try {
    const token = await getWechatMiniAccessToken();
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as { errcode?: number; errmsg?: string };
    // errcode: 0=正常, 87014=违规, 其他=错误
    if (data.errcode === 0) return true;
    if (data.errcode === 87014) return false;
    // 其他错误码（如接口限流、凭证错误等），为不影响用户提交，默认放行
    console.warn(`微信文本内容检测接口异常：errcode=${data.errcode}, errmsg=${data.errmsg}`);
    return true;
  } catch (error) {
    console.warn("微信文本内容检测调用失败，默认放行：", error);
    return true;
  }
}

/**
 * 微信小程序图片内容安全检测
 * @param imageBuffer 图片文件的 Buffer
 * @param contentType 图片 MIME 类型
 * @returns true 表示内容正常，false 表示内容违规
 */
export async function checkImageContent(imageBuffer: Buffer, contentType: string): Promise<boolean> {
  try {
    const token = await getWechatMiniAccessToken();
    const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${token}`;
    // 构造 multipart/form-data
    const boundary = "----WebKitFormBoundary" + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="media"; filename="image.jpg"\r\n`),
      Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { errcode?: number; errmsg?: string };
    if (data.errcode === 0) return true;
    if (data.errcode === 87014) return false;
    console.warn(`微信图片内容检测接口异常：errcode=${data.errcode}, errmsg=${data.errmsg}`);
    return true;
  } catch (error) {
    console.warn("微信图片内容检测调用失败，默认放行：", error);
    return true;
  }
}
