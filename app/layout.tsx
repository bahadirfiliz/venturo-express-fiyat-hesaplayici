import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3010"),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
