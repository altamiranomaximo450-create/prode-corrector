import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prode · Corrector de boletas",
  description:
    "Panel de administración para corregir automáticamente las boletas de una fecha del Prode.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#12151f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
