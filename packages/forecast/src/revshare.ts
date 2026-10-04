import Decimal from "decimal.js";
import type { RevShareTramo } from "./types";

/**
 * Revenue share sobre el float, solo en Cuentas Virtuales.
 *
 * Sobre el Saldo Promedio Ponderado consolidado. **No es escalonado**: la tasa
 * del tramo en el que cae el saldo se aplica al total, no por tramos.
 *
 *     rev_share_mes = SPP x (TPM / 12) x pct_tramo
 *
 * Por debajo del umbral minimo no hay rev share. El ultimo tramo se mantiene:
 * no hay cliff arriba de 40.000 M (correccion de Pancho del 12-ago-26; la
 * version de julio ponia 0% y era un error).
 */
export function pctTpmFor(
	tramos: readonly RevShareTramo[],
	spp: Decimal,
): Decimal {
	const found = tramos.find(
		(tramo) =>
			spp.greaterThanOrEqualTo(tramo.desdeClp) &&
			(tramo.hastaClp === null || spp.lessThan(tramo.hastaClp)),
	);
	return found?.pctTpm ?? new Decimal(0);
}

export function revShareMensual({
	spp,
	tramos,
	tpmAnual,
	umbralMinimoClp,
}: {
	spp: Decimal;
	tramos: readonly RevShareTramo[];
	tpmAnual: Decimal;
	umbralMinimoClp: Decimal;
}): Decimal {
	if (spp.lessThan(umbralMinimoClp)) return new Decimal(0);

	const pct = pctTpmFor(tramos, spp);
	if (pct.isZero()) return new Decimal(0);

	return spp.times(tpmAnual.dividedBy(12)).times(pct);
}
