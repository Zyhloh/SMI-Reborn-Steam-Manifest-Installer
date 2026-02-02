import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMI Reborn",
  description: "SMI Reborn Desktop Application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0a0a0c] text-zinc-100 overflow-hidden">
        {children}
      </body>
    </html>
  );
}
