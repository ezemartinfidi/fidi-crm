import Decimal from "decimal.js";
import type { TarifaMethod, TarifaTramo } from "./types";

/**
 * La tarifa por cuenta, en CLP por cuenta por mes.
 *
 * Dos metodos, y la diferencia es material en una negociacion:
 *
 * - `volumen` (el activo): el total de cuentas cae en una banda y **ese unico
 *   rate se aplica a todas** las cuentas. 10.000 cuentas -> 119 CLP x 10.000.
 * - `marginal`: escalonado como impuestos marginales. Las primeras cuentas de
 *   cada tramo pagan su rate y se suman los tramos. Siempre da un promedio
 *   mayor, porque las primeras cuentas pagan los rates mas caros.
 */

function tramoFor(
	tramos: readonly TarifaTramo[],
	cuentas: number,
): TarifaTramo {
	const found = tramos.find(
		(tramo) =>
			cuentas >= tramo.desde &&
			(tramo.hasta === null || cuentas <= tramo.hasta),
	);
	if (!found) {
		throw new Error(
			`Ningun tramo de tarifa cubre ${cuentas} cuentas. Los tramos deben cubrir de 1 a infinito sin huecos.`,
		);
	}
	return found;
}

/** El rate que aplica a *cada* cuenta bajo el metodo por volumen. */
export function rateForCuentas(
	tramos: readonly TarifaTramo[],
	cuentas: number,
): Decimal {
	if (cuentas <= 0) return new Decimal(0);
	return tramoFor(tramos, cuentas).rateClp;
}

/** El revenue por cuenta del mes, ya multiplicado por la cantidad de cuentas. */
export function revenuePorCuenta(
	tramos: readonly TarifaTramo[],
	cuentas: number,
	method: TarifaMethod,
): Decimal {
	if (cuentas <= 0) return new Decimal(0);

	if (method === "volumen") {
		return rateForCuentas(tramos, cuentas).times(cuentas);
	}

	// Marginal: cada tramo cobra su rate solo por las cuentas que caen dentro.
	let total = new Decimal(0);
	for (const tramo of tramos) {
		if (cuentas < tramo.desde) break;
		const techo =
			tramo.hasta === null ? cuentas : Math.min(tramo.hasta, cuentas);
		const enTramo = techo - tramo.desde + 1;
		if (enTramo > 0) total = total.plus(tramo.rateClp.times(enTramo));
	}
	return total;
}

/** El promedio efectivo por cuenta. Util para comparar los dos metodos. */
export function rateEfectivo(
	tramos: readonly TarifaTramo[],
	cuentas: number,
	method: TarifaMethod,
): Decimal {
	if (cuentas <= 0) return new Decimal(0);
	return revenuePorCuenta(tramos, cuentas, method).dividedBy(cuentas);
}
