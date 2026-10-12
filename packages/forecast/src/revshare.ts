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
 * Por debajo del umbral minimo no hay rev share.
 *
 * El ultimo tramo es abierto y no hay cliff. El "tramo 5" al 0% arriba de
 * 40.000 M que aparecia en el Excel v4 no existe (Ezequiel, 12-oct-26), asi que
 * un saldo grande sigue pagando 35% y no cae a cero.
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
