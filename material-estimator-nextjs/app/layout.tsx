import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drawing Material Estimator",
  description: "Staged PDF drawing extraction, validation, and Excel BOQ generation",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
