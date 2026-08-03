# Venturo Express Fiyat ve Proforma Portalı

Venturo Express için İstanbul kurye fiyatlandırması, kârlılık analizi, tekli iş
kaydı, firma/ay arşivi ve proforma hazırlama portalı.

## Özellikler

- İstanbul'un 39 ilçesini 17 fiyat bölgesi üzerinden hesaplama
- Motorlu ve arabalı kurye tarifeleri
- Normal, Acil, Ekspres, Gece ve VIP hizmet katsayıları
- Paket/desi katsayıları ve 20 km üzeri iki kat ek kilometre bedeli
- Köprü maliyeti ile Venturo ve taşeron net kâr analizi
- Excel ile firma/ay bazında toplu fiyatlandırma
- D1 üzerinde kalıcı tekli iş kayıtları
- Firma ve hizmet ayına göre iş/proforma listesi
- Venturo logolu, KDV dökümlü yazdırılabilir proforma

## Gereksinimler

- Node.js `>=22.13.0`
- pnpm

## Yerel Çalıştırma

```bash
pnpm install
pnpm dev
```

Portal sabit olarak [http://localhost:3010](http://localhost:3010) adresinde
çalışır.

## Kontroller

```bash
pnpm lint
pnpm test
pnpm build
```

Drizzle şeması değiştiğinde yeni migration üretmek için `pnpm db:generate`
komutu kullanılabilir.

## Teknoloji

Next.js uyumlu Vinext, React, TypeScript, Cloudflare D1, Drizzle ORM ve pnpm.
