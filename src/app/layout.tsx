import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PodcastHelper — grava o teu podcast, cada um no seu aparelho",
    template: "%s · PodcastHelper",
  },
  description:
    "Estúdio de podcast remoto e gratuito. Cada pessoa grava o próprio micro e câmara em alta qualidade, tudo sincronizado, e no fim todos recebem as faixas para editar.",
  applicationName: "PodcastHelper",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-PT" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
