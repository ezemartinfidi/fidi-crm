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
 * Ramp: 5pp acumulativos en cada uno de los tres primeros meses y +10pp por mes
 * despues, hasta 100%.
 *
 *     mes  1   2   3   4   5   6   7   8   9  10  11  12
 *     pct  5  10  15  25  35  45  55  65  75  85  95 100
 *
 * Asi el 100% cae exacto en el mes 12, que es lo que el Excel v4 rotula como
 * "lineal 12m (5/5/5, luego +10pp hasta 100%)".
 *
 * El "5/5/5" es **acumulativo**, no tres meses planos al 5%. La diferencia no
 * se podia resolver leyendo el rotulo (las dos lecturas son gramaticales), asi
 * que se despejo del Excel: con el minimo, las cuentas y el valor esperado de
 * cada mes se resuelve numericamente el porcentaje implicito, y sobre 23 deals
 * de Infra la mediana da exactamente esta tabla en los doce meses.
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
export function infraPctPorDefecto(mes: number): Decimal {
	if (mes < 1) return new Decimal(0);

	// Los tres primeros acumulan 5pp cada uno: 5, 10, 15.
	if (mes <= INFRA_MESES_PLANOS) return INFRA_ARRANQUE_PCT.times(mes);

	const base = INFRA_ARRANQUE_PCT.times(INFRA_MESES_PLANOS);
	const pct = base.plus(INFRA_INCREMENTO_PP.times(mes - INFRA_MESES_PLANOS));
	return Decimal.min(pct, 1);
}
