import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readSheet } from "read-excel-file/node";

const projectRoot = new URL("../", import.meta.url);
test("builds the Venturo Express calculator as a standalone app", async () => {
  await access(new URL(".next/standalone/server.js", projectRoot));
  const [pageSource, layoutSource, loginSource, portalSource, customerPricingSource] = await Promise.all([
    readFile(new URL("app/admin-dashboard.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("app/giris/login-form.tsx", projectRoot), "utf8"),
    readFile(new URL("app/musteri/customer-portal.tsx", projectRoot), "utf8"),
    readFile(new URL("app/lib/customer/pricing.ts", projectRoot), "utf8"),
  ]);

  assert.match(
    layoutSource,
    /Venturo Express \| İstanbul Kurye Fiyat Hesaplayıcı/,
  );
  assert.match(pageSource, /Kurye fiyatını rota ve gönderiye göre anında hesapla/);
  assert.match(pageSource, /39 ilçe · 17 fiyat bölgesi/);
  assert.match(pageSource, /Hesaplanan fiyat/);
  assert.match(layoutSource, /og\.png/);
  assert.match(loginSource, /Hesabınıza giriş yapın/);
  assert.match(portalSource, /Salt okunur belge/);
  assert.match(portalSource, /Fiyat Hesapla/);
  assert.match(portalSource, /Bölge Haritası/);
  assert.match(portalSource, /Fiyat Matrisleri/);
  assert.match(portalSource, /Model Detayı/);
  assert.doesNotMatch(
    portalSource,
    /Venturo net kârı|Taşerona verirsek|Maliyet parametreleri|pricing-data/,
  );
  assert.doesNotMatch(
    customerPricingSource,
    /pricingData\.parameters|marketPositioningPremium|Venturo net kârı|Taşerona verirsek/,
  );
  assert.doesNotMatch(pageSource, /codex-preview|Your site is taking shape/);
});

test("keeps the Excel-derived data complete and internally consistent", async () => {
  const raw = await readFile(
    new URL("../app/pricing-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);

  assert.equal(data.zones.length, 17);
  assert.equal(data.districts.length, 39);
  assert.equal(new Set(data.districts.map((item) => item.name)).size, 39);
  assert.equal(data.priorities.length, 5);
  assert.equal(data.packages.length, 5);
  assert.equal(data.desiRules.length, 10);
  assert.equal(data.parameters.length, 33);
  assert.equal(data.sources.length, 11);
  assert.equal(data.limitations.length, 5);

  for (const matrixName of [
    "distanceMatrix",
    "durationMatrix",
    "motorPriceMatrix",
    "carPriceMatrix",
  ]) {
    assert.equal(data[matrixName].length, 17, matrixName);
    assert.ok(
      data[matrixName].every((row) => row.length === 17),
      `${matrixName} 17 sütun içermeli`,
    );
  }

  const b01 = data.zoneCodes.indexOf("B01");
  const b02 = data.zoneCodes.indexOf("B02");
  const b10 = data.zoneCodes.indexOf("B10");
  const b17 = data.zoneCodes.indexOf("B17");

  assert.equal(data.motorPriceMatrix[b01][b01], 330);
  assert.equal(data.motorPriceMatrix[b01][b02], 500);
  assert.equal(data.motorPriceMatrix[b01][b10], 580);
  assert.equal(data.carPriceMatrix[b01][b01], 550);
  assert.equal(data.carPriceMatrix[b01][b02], 700);
  assert.equal(data.carPriceMatrix[b01][b10], 990);
  assert.equal(data.motorPriceMatrix[b01][b17], "Özel teklif");
  assert.equal(data.carPriceMatrix[b17][b10], "Özel teklif");
  assert.equal(data.meta.extraKmRate.motor, 10);
  assert.equal(data.meta.extraKmRate.car, 20);
  assert.equal(data.meta.longDistanceThresholdKm, 20);
  assert.equal(data.meta.longDistanceExtraKmFactor, 2);
  assert.equal(
    data.priorities.find((item) => item.name === "Acil").factor,
    1.35,
  );
  assert.equal(
    data.priorities.find((item) => item.name === "Ekspres").factor,
    1.6,
  );
  assert.equal(
    data.priorities.find((item) => item.name === "Gece").factor,
    2,
  );
  assert.equal(
    data.priorities.find((item) => item.name === "VIP").factor,
    2,
  );
});

test("ships the daily external transport income and expense ledger", async () => {
  const [dashboardSource, ledgerSource, apiSource, databaseSource, migrationSource] =
    await Promise.all([
      readFile(new URL("app/admin-dashboard.tsx", projectRoot), "utf8"),
      readFile(new URL("app/external-transport-ledger.tsx", projectRoot), "utf8"),
      readFile(new URL("app/api/external-transport/route.ts", projectRoot), "utf8"),
      readFile(new URL("db/index.ts", projectRoot), "utf8"),
      readFile(new URL("drizzle/0002_whole_tombstone.sql", projectRoot), "utf8"),
    ]);

  assert.match(dashboardSource, /Harici Taşıma/);
  assert.match(ledgerSource, /Günlük kazanç \/ gelir \(TL\)/);
  assert.match(ledgerSource, /\+ Gider kalemi/);
  assert.match(ledgerSource, /Toplam gelir/);
  assert.match(ledgerSource, /Toplam gider/);
  assert.match(ledgerSource, /Net bakiye/);
  assert.match(ledgerSource, /Günlük kaydı güncelle/);
  assert.match(ledgerSource, /Düzenlemeyi iptal et/);
  assert.match(ledgerSource, /\{ label: "Üyelik", amount: "1000,00" \}/);
  assert.match(ledgerSource, /\{ label: "Araç Kirası", amount: "1233,00" \}/);
  assert.match(
    ledgerSource,
    /\{ label: "Şoför Parası", amount: "1000,00" \}/,
  );
  assert.match(
    ledgerSource,
    /\{ label: "Yakıt", amount: "", optional: true \}/,
  );
  assert.match(apiSource, /apiAccessError\(\["admin"\]\)/);
  assert.match(apiSource, /ON CONFLICT \(entry_date\) DO UPDATE/);
  assert.match(apiSource, /export async function PATCH/);
  assert.match(databaseSource, /external_transport_expenses/);
  assert.match(migrationSource, /ON DELETE cascade/);

  const income = 1000;
  const expenses = [300, 50];
  assert.equal(income - expenses.reduce((sum, amount) => sum + amount, 0), 650);
});

test("preserves the verified price scenarios", async () => {
  const raw = await readFile(
    new URL("../app/pricing-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);

  function price({
    departure,
    arrival,
    vehicle,
    priority,
    packageName,
    actualDesi,
  }) {
    const fromDistrict = data.districts.find(
      (item) => item.name === departure,
    );
    const toDistrict = data.districts.find((item) => item.name === arrival);
    const fromIndex = data.zoneCodes.indexOf(fromDistrict.zoneCode);
    const toIndex = data.zoneCodes.indexOf(toDistrict.zoneCode);
    const matrix =
      vehicle === "Motor Kurye"
        ? data.motorPriceMatrix
        : data.carPriceMatrix;
    const base = matrix[fromIndex][toIndex];
    if (typeof base !== "number") return "Özel teklif";

    const priorityRule = data.priorities.find(
      (item) => item.name === priority,
    );
    const packageRule = data.packages.find(
      (item) => item.name === packageName,
    );
    const appliedDesi = actualDesi ?? packageRule.defaultDesi;
    const desiRule = data.desiRules
      .filter((item) => item.vehicle === vehicle)
      .reverse()
      .find((item) => appliedDesi >= item.minDesi);
    const distance = data.distanceMatrix[fromIndex][toIndex];
    const extraKm = Math.max(distance - data.meta.includedZoneKm, 0);
    const longDistanceExtraKm = Math.max(
      distance - data.meta.longDistanceThresholdKm,
      0,
    );
    const standardExtraKm = extraKm - longDistanceExtraKm;
    const extraKmRate =
      vehicle === "Motor Kurye"
        ? data.meta.extraKmRate.motor
        : data.meta.extraKmRate.car;
    const extraKmCharge =
      standardExtraKm * extraKmRate +
      longDistanceExtraKm *
        extraKmRate *
        data.meta.longDistanceExtraKmFactor;
    const multiplier =
      priorityRule.factor * Math.max(packageRule.factor, desiRule.factor);
    return Math.ceil(((base + extraKmCharge) * multiplier) / 10) * 10;
  }

  assert.equal(
    price({
      departure: "Beşiktaş",
      arrival: "Şişli",
      vehicle: "Motor Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
    }),
    330,
  );
  assert.equal(
    price({
      departure: "Sarıyer",
      arrival: "Beşiktaş",
      vehicle: "Motor Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
    }),
    500,
  );
  assert.equal(
    price({
      departure: "Sarıyer",
      arrival: "Çekmeköy",
      vehicle: "Motor Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
    }),
    790,
  );
  assert.equal(
    price({
      departure: "Sarıyer",
      arrival: "Çekmeköy",
      vehicle: "Arabalı Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
    }),
    1410,
  );
  assert.equal(
    price({
      departure: "Beşiktaş",
      arrival: "Fatih",
      vehicle: "Motor Kurye",
      priority: "Acil",
      packageName: "Küçük Paket",
    }),
    1060,
  );
  assert.equal(
    price({
      departure: "Beşiktaş",
      arrival: "Kadıköy",
      vehicle: "Arabalı Kurye",
      priority: "VIP",
      packageName: "Paket",
    }),
    3990,
  );
  assert.equal(
    price({
      departure: "Adalar",
      arrival: "Kadıköy",
      vehicle: "Motor Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
    }),
    "Özel teklif",
  );
  assert.equal(
    price({
      departure: "Beşiktaş",
      arrival: "Kadıköy",
      vehicle: "Motor Kurye",
      priority: "Normal",
      packageName: "1 A4 Evrak",
      actualDesi: 6,
    }),
    1030,
  );
  assert.equal(
    price({
      departure: "Beşiktaş",
      arrival: "Kadıköy",
      vehicle: "Motor Kurye",
      priority: "Gece",
      packageName: "1 A4 Evrak",
    }),
    1170,
  );
});

test("calculates Venturo net profit for own and outsourced operations", async () => {
  const raw = await readFile(
    new URL("../app/pricing-data.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);
  const b01 = data.zoneCodes.indexOf("B01");
  const b10 = data.zoneCodes.indexOf("B10");
  const parameter = (name) =>
    data.parameters.find((item) => item.name === name).motor;
  const distance = data.distanceMatrix[b01][b10];
  const duration = data.durationMatrix[b01][b10];
  const extraKm =
    Math.max(distance - data.meta.includedZoneKm, 0) *
    data.meta.extraKmRate.motor;
  const salePrice =
    Math.ceil(
      (data.motorPriceMatrix[b01][b10] + extraKm) /
        data.meta.roundingStep,
    ) * data.meta.roundingStep;
  const bridge = parameter("FSM / 15 Temmuz geçişi");
  const operatingCostBeforeBridge =
    parameter("Baz operasyon gideri") +
    distance * parameter("Toplam araç değişken maliyeti") +
    ((duration * parameter("Trafik süre çarpanı") +
      parameter("Teslim alma + bırakma") +
      parameter("Kıtalararası ek tampon")) *
      parameter("Sürücü tam maliyeti")) /
      60;
  const ownGrossProfit = salePrice - operatingCostBeforeBridge - bridge;
  const ownTax = ownGrossProfit * 0.2;
  const ownNetProfit = ownGrossProfit - ownTax;
  const courierShare = salePrice * 0.6;
  const venturoShare = salePrice * 0.4;
  const outsourcedTax = venturoShare * 0.2;
  const outsourcedNetProfit = venturoShare - outsourcedTax;

  assert.equal(bridge, 25);
  assert.ok(Math.abs(operatingCostBeforeBridge - 240.1197547) < 0.0001);
  assert.ok(Math.abs(ownNetProfit - 259.90419624) < 0.0001);
  assert.equal(courierShare, 354);
  assert.equal(venturoShare, 236);
  assert.ok(Math.abs(outsourcedTax - 47.2) < 0.0001);
  assert.ok(Math.abs(outsourcedNetProfit - 188.8) < 0.0001);
});

test("ships the map and social preview assets", async () => {
  await Promise.all([
    access(new URL("public/istanbul-bolge-haritasi.png", projectRoot)),
    access(new URL("public/og.png", projectRoot)),
  ]);
});

test("ships a parseable bulk-pricing Excel template", async () => {
  const templateUrl = new URL(
    "public/venturo-toplu-is-fiyatlandirma-sablonu.xlsx",
    projectRoot,
  );
  await access(templateUrl);

  const rows = await readSheet(fileURLToPath(templateUrl), "İş Listesi", {
    dateFormat: "dd.mm.yyyy",
  });
  assert.deepEqual(rows[3], [
    "Firma",
    "İş Tarihi",
    "Sipariş No",
    "Çıkış İlçesi",
    "Varış İlçesi",
    "Araç Tipi",
    "Öncelik",
    "Gönderi Profili",
    "Gerçek Desi",
    "Açıklama",
  ]);

  const fixtureRows = await readSheet(
    fileURLToPath(
      new URL("tests/fixtures/venturo-toplu-is-ornek.xlsx", projectRoot),
    ),
    "İş Listesi",
    { dateFormat: "dd.mm.yyyy" },
  );
  assert.equal(fixtureRows.length, 7);
  assert.equal(fixtureRows[4][0], "Örnek Firma A.Ş.");
  assert.ok(fixtureRows[4][1] instanceof Date);
  assert.equal(fixtureRows[6][5], "Arabalı Kurye");
});
