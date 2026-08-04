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
- PostgreSQL üzerinde kalıcı tekli iş kayıtları
- Firma ve hizmet ayına göre iş/proforma listesi
- Venturo logolu, KDV dökümlü yazdırılabilir proforma
- Rol bazlı yönetici ve müşteri girişi
- Müşteriye özel iş arşivi, fiyat hesaplama ve salt okunur proforma

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

Tekli iş ve proforma kayıtları için `DATABASE_URL` değişkeniyle bir PostgreSQL
bağlantısı verilmelidir.

İlk kurulumda `INITIAL_ADMIN_PASSWORD` ve `INITIAL_TERA_PASSWORD` ortam
değişkenleri verilirse `venturo.admin` ve `nazife.vural` kullanıcıları bir kez
oluşturulur. Şifreler açık metin saklanmaz ve ilk girişte değiştirilir.

## Coolify

Repo kökündeki `docker-compose.yml`, uygulamayı ve kalıcı PostgreSQL servisini
birlikte çalıştırır. Coolify kaynağı Docker Compose build pack ile `main`
branch'inden oluşturulabilir; veritabanı parolası `SERVICE_PASSWORD_POSTGRES`
değişkeniyle otomatik üretilir.

## Kontroller

```bash
pnpm lint
pnpm test
pnpm build
```

Drizzle şeması değiştiğinde yeni migration üretmek için `pnpm db:generate`
komutu kullanılabilir.

## Teknoloji

Next.js, React, TypeScript, PostgreSQL, Drizzle ORM, Docker ve pnpm.
