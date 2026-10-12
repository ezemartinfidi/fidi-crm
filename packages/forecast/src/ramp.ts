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

/**
 * El ramp por defecto de Infraestructura cuando el deal no declara Meses de
 * Ramp: 5% en cada uno de los tres primeros meses y despues +10pp por mes,
 * hasta 100%.
 *
 * Con estos valores el 100% cae en el mes 13, no en el 12. El Excel v4 rotula
 * la regla como "lineal 12m (5/5/5, luego +10pp hasta 100%)", y las dos cosas
 * no cierran: 5,5,5,15,25,...,95 son doce meses y el doceavo vale 95%.
 *
 * Se implementa la regla literal, no el rotulo, porque la regla es la que
 * describe el comportamiento mes a mes. Si EVAL-F1 marca diferencia en un deal
 * de Infra sin Meses de Ramp, esta es la primera sospechosa: la otra lectura
 * posible es que "5/5/5" sea acumulativo (5, 10, 15) y ahi si el 100% cae en el
 * mes 12.
 */
const INFRA_ARRANQUE_PCT = new Decimal("0.05");
const INFRA_MESES_PLANOS = 3;
const INFRA_INCREMENTO_PP = new Decimal("0.10");

/**
 * Ramp lineal hasta el tope. Infraestructura, que no tiene float.
 *
 * Con `mesesDeRamp` es lineal `mes / mesesDeRamp`. Sin el, aplica la escalera
 * por defecto de arriba. Antes esta rama devolvia el tope desde el mes 1, que
 * equivalia a no tener ramp.
 */
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

	if (mesesDeRamp == null || mesesDeRamp <= 0) {
		return tope.times(infraPctPorDefecto(mes));
	}

	if (mes >= mesesDeRamp) return tope;
	return tope.times(mes).dividedBy(mesesDeRamp);
}

/** La fraccion del tope en el mes `mes`, acotada a 1. */
function infraPctPorDefecto(mes: number): Decimal {
	if (mes <= INFRA_MESES_PLANOS) return INFRA_ARRANQUE_PCT;

	const escalones = mes - INFRA_MESES_PLANOS;
	const pct = INFRA_ARRANQUE_PCT.plus(INFRA_INCREMENTO_PP.times(escalones));
	return Decimal.min(pct, 1);
}
