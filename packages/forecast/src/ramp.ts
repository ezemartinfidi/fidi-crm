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
	/** Define el factor: el ramp llega al 100% exacto en este mes. */
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

	const factor = factorDeRamp(params, mesesDeRamp);
	const compuestos = mes - params.mesesPlanos;
	return Decimal.min(plano.times(factor.pow(compuestos)), tope);
}

/**
 * El factor del ramp geometrico de Cuentas Virtuales.
 *
 * **Se deriva de `Meses de Ramp`**, no es una constante:
 *
 *     factor = (1 / arranque) ^ (1 / (Meses de Ramp − meses planos))
 *
 * Asi el ramp toca el 100% exacto en el mes `Meses de Ramp`, que es lo que la
 * metodologia del 7-oct-2026 define. Con tope 7.000 MM, ramp 8 y 1 mes plano el
 * factor da 1,534 y la curva es 5,0 / 7,7 / 11,8 / 18,1 / 27,7 / 42,5 / 65,2 /
 * 100.
 *
 * El modelo de agosto usaba factores fijos (1,145 para saldo y 1,68 para
 * cuentas) que no dependian de la duracion, asi que el ramp llegaba al tope
 * cuando llegaba. Los de `params` quedan como fallback para un deal sin Meses
 * de Ramp, que en Cuentas Virtuales no deberia pasar porque el campo es
 * obligatorio.
 */
export function factorDeRamp(
	params: RampParams,
	mesesDeRamp: number | null | undefined,
): Decimal {
	if (mesesDeRamp == null || mesesDeRamp <= params.mesesPlanos) {
		return params.factor;
	}
	if (params.arranquePct.lessThanOrEqualTo(0)) return params.factor;

	const exponente = new Decimal(1).dividedBy(mesesDeRamp - params.mesesPlanos);
	return new Decimal(1).dividedBy(params.arranquePct).pow(exponente);
}

/**
 * Ramp lineal hasta el tope: `tope x (mes / Meses de Ramp)`, sin meses planos.
 * Infraestructura, que no tiene float.
 *
 * **Sin `Meses de Ramp` el deal entra directo al tope en el go-live.** No es un
 * olvido: la metodologia del 7-oct-2026 lo dice explicito.
 *
 * El modelo de agosto aplicaba en cambio una escalera 5/10/15 y despues +10pp,
 * que se despejo del Excel v4 y reproducia sus numeros exacto. Describe bien lo
 * que la planilla hacia en agosto, pero no lo que el modelo hace hoy.
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
	if (mesesDeRamp == null || mesesDeRamp <= 0) return tope;
	if (mes >= mesesDeRamp) return tope;

	return tope.times(mes).dividedBy(mesesDeRamp);
}
