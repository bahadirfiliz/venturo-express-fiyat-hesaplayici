import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0];
  const host = forwardedHost?.trim() || requestHeaders.get("host");
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol || (host?.includes("localhost") ? "http" : "https");
  let metadataBase = new URL("http://localhost:3010");

  if (host) {
    try {
      metadataBase = new URL(`${protocol}://${host}`);
    } catch {
      // Keep the local fallback when a proxy sends an invalid host header.
    }
  }

  return {
    metadataBase,
    title: "Venturo Express | İstanbul Kurye Fiyat Hesaplayıcı",
    description:
      "39 ilçe, 17 kurye bölgesi, motorlu ve arabalı kurye için anlık fiyat hesaplama.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Venturo Express | İstanbul Kurye Fiyat Hesaplayıcı",
      description:
        "39 ilçe, 17 bölge; motor ve arabalı kurye için rota bazlı fiyatlandırma.",
      locale: "tr_TR",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Venturo Express İstanbul Kurye Fiyat Hesaplayıcı",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Venturo Express | İstanbul Kurye Fiyat Hesaplayıcı",
      description: "39 ilçe ve 17 bölge için anlık kurye fiyatı.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
