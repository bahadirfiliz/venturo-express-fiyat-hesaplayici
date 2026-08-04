import "server-only";

import { pricingData } from "../../pricing-data";

export type CustomerVehicle = "Motor Kurye" | "Arabalı Kurye";

export type CustomerQuoteInput = {
  departure: string;
  arrival: string;
  vehicle: CustomerVehicle;
  priority: string;
  packageProfile: string;
  actualDesi: number | null;
};

export function getCustomerPricingOptions() {
  return {
    districts: pricingData.districts.map((district) => ({
      name: district.name,
      zoneCode: district.zoneCode,
    })),
    vehicles: ["Motor Kurye", "Arabalı Kurye"] as CustomerVehicle[],
    priorities: pricingData.priorities.map((priority) => priority.name),
    packages: pricingData.packages.map((item) => item.name),
    vatRate: 0.2,
    priceDate: pricingData.meta.updatedAt,
  };
}

export function calculateCustomerQuote(input: CustomerQuoteInput) {
  const departure = pricingData.districts.find(
    (district) => district.name === input.departure,
  );
  const arrival = pricingData.districts.find(
    (district) => district.name === input.arrival,
  );
  const vehicle =
    input.vehicle === "Motor Kurye" || input.vehicle === "Arabalı Kurye"
      ? input.vehicle
      : null;
  const priority = pricingData.priorities.find(
    (item) => item.name === input.priority,
  );
  const packageRule = pricingData.packages.find(
    (item) => item.name === input.packageProfile,
  );
  if (!departure || !arrival || !vehicle || !priority || !packageRule) {
    throw new Error("Fiyatlandırma seçimi geçersiz.");
  }

  const fromIndex = pricingData.zoneCodes.indexOf(departure.zoneCode);
  const toIndex = pricingData.zoneCodes.indexOf(arrival.zoneCode);
  const matrix =
    vehicle === "Motor Kurye"
      ? pricingData.motorPriceMatrix
      : pricingData.carPriceMatrix;
  const baseCell = matrix[fromIndex][toIndex];
  const distanceCell = pricingData.distanceMatrix[fromIndex][toIndex];
  const distanceKm = typeof distanceCell === "number" ? distanceCell : null;
  const special =
    departure.zoneCode === pricingData.meta.specialZoneCode ||
    arrival.zoneCode === pricingData.meta.specialZoneCode ||
    typeof baseCell !== "number";

  const actualDesi =
    input.actualDesi === null || input.actualDesi === undefined
      ? null
      : Number(input.actualDesi);
  if (actualDesi !== null && (!Number.isFinite(actualDesi) || actualDesi < 0)) {
    throw new Error("Gerçek desi geçersiz.");
  }
  const appliedDesi = actualDesi ?? packageRule.defaultDesi;
  const desiRule = [...pricingData.desiRules]
    .filter((item) => item.vehicle === vehicle)
    .reverse()
    .find((item) => appliedDesi >= item.minDesi);
  if (!desiRule) throw new Error("Desi kuralı bulunamadı.");

  if (special || typeof baseCell !== "number") {
    return {
      special: true as const,
      departureZone: departure.zoneCode,
      arrivalZone: arrival.zoneCode,
      distanceKm,
      appliedDesi,
      priceDate: pricingData.meta.updatedAt,
    };
  }

  const extraKmRate =
    vehicle === "Motor Kurye"
      ? pricingData.meta.extraKmRate.motor
      : pricingData.meta.extraKmRate.car;
  const extraKm = Math.max(
    (distanceKm ?? 0) - pricingData.meta.includedZoneKm,
    0,
  );
  const longDistanceExtraKm = Math.max(
    (distanceKm ?? 0) - pricingData.meta.longDistanceThresholdKm,
    0,
  );
  const standardExtraKm = Math.max(extraKm - longDistanceExtraKm, 0);
  const extraKmCharge =
    standardExtraKm * extraKmRate +
    longDistanceExtraKm *
      extraKmRate *
      pricingData.meta.longDistanceExtraKmFactor;
  const loadFactor = Math.max(packageRule.factor, desiRule.factor);
  const netPrice =
    Math.ceil(
      ((baseCell + extraKmCharge) * priority.factor * loadFactor) /
        pricingData.meta.roundingStep,
    ) * pricingData.meta.roundingStep;
  const vatRate = 0.2;

  return {
    special: false as const,
    departureZone: departure.zoneCode,
    arrivalZone: arrival.zoneCode,
    distanceKm,
    appliedDesi,
    netPrice,
    vatRate,
    vat: netPrice * vatRate,
    gross: netPrice * (1 + vatRate),
    priceDate: pricingData.meta.updatedAt,
  };
}
