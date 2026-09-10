import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./VizPreview.css";
import { QIDENG_COLORS } from "./design-system-values";

export const metadata: Metadata = {
  title: { default: "TDE", template: "%s｜TDE" },
  description: "TDE运营台。",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: QIDENG_COLORS.surface };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
