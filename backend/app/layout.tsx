import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wild Magic Assumptions - AI-Powered Behavioral Inference",
  description: "Generate bold assumptions from your browsing behavior",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
