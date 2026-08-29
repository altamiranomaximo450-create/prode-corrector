import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corrector de Prode",
  description: "Cargá los resultados oficiales, subí el PDF de boletas y obtené el ranking.",
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
