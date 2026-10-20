import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeBot MT5",
  description: "Panel del sistema de trading autónomo conectado a MetaTrader 5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
