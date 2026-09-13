const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://aka.doubaocdn.com https://*.doubaocdn.com https://*.byteimg.com https://byteimg.com; font-src 'self' data: https://miaoda.feishu.cn; style-src 'self' 'unsafe-inline' https://miaoda.feishu.cn; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const creatorScheduleHeaders = securityHeaders.map((header) => {
  if (header.key === "Content-Security-Policy") {
    return { ...header, value: header.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") };
  }
  if (header.key === "X-Frame-Options") return { ...header, value: "SAMEORIGIN" };
  return header;
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        os: false,
        path: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
    }
    return config;
  },
  async headers() {
    return [
      { source: "/", headers: noStoreHeaders },
      { source: "/login", headers: noStoreHeaders },
      { source: "/join", headers: noStoreHeaders },
      { source: "/studio", headers: noStoreHeaders },
      { source: "/admin", headers: noStoreHeaders },
      { source: "/admin/:path*", headers: noStoreHeaders },
      { source: "/viz", headers: noStoreHeaders },
      { source: "/viz/:path*", headers: noStoreHeaders },
      { source: "/vizv2", headers: noStoreHeaders },
      { source: "/vizv2/:path*", headers: noStoreHeaders },
      { source: "/chandiduan", headers: noStoreHeaders },
      { source: "/chandiduan/:path*", headers: noStoreHeaders },
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/index.html",
        has: [{ type: "query", key: "embed", value: "schedule" }],
        headers: creatorScheduleHeaders,
      },
    ];
  },
};

export default nextConfig;
