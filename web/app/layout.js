import "./globals.css";

export const metadata = {
  title: "Concord · Achadinhos",
  description: "Vídeos automáticos de achadinhos da Shopee",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport = { themeColor: "#ee4d2d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
