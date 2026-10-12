import Decimal from "decimal.js";
import type { ComponentesMes } from "./components";
import { componentesDelMes, revenueLineOf } from "./components";
import type { DealForecastInput } from "./deal-input";
import { monthRange } from "./month";
import type { ForecastParams } from "./params";
import type { MonthIndex, RevenueLine } from "./types";

/**
 * La proyeccion de un deal a lo largo del horizonte.
 *
 * El float **no** esta: el rev share depende del SPP consolidado de todos los
 * deals del escenario, asi que solo se puede calcular despues de sumar. Lo que
 * este deal aporta es `saldoFloat` en cada mes, y `aggregate.ts` lo usa.
 */
export type DealProjection = {
	readonly dealId: string;
	readonly revenueLine: RevenueLine;
	readonly meses: readonly ComponentesMes[];
};

export function projectDeal({
	input,
	params,
	mes1,
	horizonteMeses,
}: {
	input: DealForecastInput;
	params: ForecastParams;
	mes1: MonthIndex;
	horizonteMeses: number;
}): DealProjection {
	return {
		dealId: input.dealId,
		revenueLine: revenueLineOf(input),
		meses: monthRange(mes1, horizonteMeses).map((mes) =>
			componentesDelMes({ mes, input, params }),
		),
	};
}

/**
 * El MRR de regimen: lo que el deal factura por mes una vez que el ramp
 * termino y antes de que el contrato se acabe.
 *
 * Es la base de **bookings**, que se reconoce entero en el mes del Expected
 * Close. Bookings y facturacion reconocida son metricas distintas y nunca van
 * en la misma serie de un grafico: bookings dice cuanto se vendio, facturacion
 * dice cuanto entra ese mes.
 */
export function mrrDeRegimen(projection: DealProjection): Decimal {
	return projection.meses.reduce(
		(max, mes) => Decimal.max(max, mes.recurrente),
		new Decimal(0),
	);
}
