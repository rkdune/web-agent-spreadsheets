import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paradigm Clone - AI Spreadsheet",
  description: "A clone of Paradigm AI's spreadsheet product with AI-powered data generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
