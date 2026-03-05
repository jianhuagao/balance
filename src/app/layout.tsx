import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "高级平账控制台",
  description: "智能账户对账与最少转账建议",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
