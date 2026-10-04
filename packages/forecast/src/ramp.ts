import Decimal from "decimal.js";
import type { RampParams } from "./types";

/**
 * Los ramps arrancan en el go-live, nunca antes. `mes` es 1-based: el mes 1 es
 * el go-live mismo.
 *
 * Cuentas Virtuales compone: los primeros `mesesPlanos` meses valen
 * `arranquePct` del tope cada uno (planos, no acumulativos), y a partir de ahi
 * cada mes es el anterior por `factor`, hasta tocar el tope y quedarse ahi.
 *
 * Infraestructura no tiene float, y su ramp de cuentas es lineal a lo largo de
 * los meses de ramp.
 */
export function rampCompuesto({
	mes,
	tope,
	params,
	mesesDeRamp,
}: {
	mes: number;
	tope: Decimal;
	params: RampParams;
	/** Acota la duracion del ramp: desde aca en adelante vale el tope. */
	mesesDeRamp?: number | null;
}): Decimal {
	if (mes < 1) return new Decimal(0);
	if (tope.lessThanOrEqualTo(0)) return new Decimal(0);

	if (mesesDeRamp != null && mesesDeRamp > 0 && mes >= mesesDeRamp) {
		return tope;
	}

	const plano = tope.times(params.arranquePct);
	if (mes <= params.mesesPlanos) {
		return Decimal.min(plano, tope);
	}

	const compuestos = mes - params.mesesPlanos;
	const valor = plano.times(params.factor.pow(compuestos));
	return Decimal.min(valor, tope);
}

/** Ramp lineal hasta el tope a lo largo de `mesesDeRamp`. Infra, sin float. */
export function rampLineal({
	mes,
	tope,
	mesesDeRamp,
}: {
	mes: number;
	tope: Decimal;
	mesesDeRamp: number | null | undefined;
}): Decimal {
	if (mes < 1) return new Decimal(0);
	if (tope.lessThanOrEqualTo(0)) return new Decimal(0);
	if (mesesDeRamp == null || mesesDeRamp <= 0) return tope;
	if (mes >= mesesDeRamp) return tope;

	return tope.times(mes).dividedBy(mesesDeRamp);
}
