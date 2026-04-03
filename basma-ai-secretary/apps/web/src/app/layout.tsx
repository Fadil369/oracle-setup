import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Basma AI Secretary | BrainSAIT",
  description: "Bilingual AI Secretary for Healthcare and Enterprise.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="mesh-gradient min-h-screen">
        {children}
      </body>
    </html>
  );
}
