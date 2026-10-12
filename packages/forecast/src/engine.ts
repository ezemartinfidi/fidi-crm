import type { MesAgregado } from "./aggregate";
import { aggregate } from "./aggregate";
import type { DealForecast } from "./deal-input";
import { monthIndexFromKey } from "./month";
import type { ForecastParams } from "./params";
import { paramsChecksum } from "./params";
import type { DealProjection } from "./project";
import { projectDeal } from "./project";
import { perteneceAEscenario, scenarioFloorOf } from "./scenarios";
import type { MonthIndex, Scenario } from "./types";

/**
 * El punto de entrada del motor. Puro: sin I/O, sin `Date.now()`, sin Prisma.
 *
 * Un resultado trae con que se produjo, no solo los numeros. Dos corridas son
 * comparables solo si coinciden `paramsChecksum` y `engineVersion`, y sin eso
 * un snapshot viejo es un numero sin contexto.
 */

/** Se bumpea ante cualquier cambio de comportamiento del calculo. */
export const ENGINE_VERSION = "0.2.0";

export type ForecastResult = {
	readonly scenario: Scenario;
	readonly mes1: MonthIndex;
	readonly horizonteMeses: number;
	readonly engineVersion: string;
	readonly paramsChecksum: string;
	/** Los deals que entraron al escenario, en orden de entrada. */
	readonly dealIds: readonly string[];
	readonly meses: readonly MesAgregado[];
	readonly porDeal: readonly DealProjection[];
};

export function runForecast({
	deals,
	params,
	scenario,
}: {
	deals: readonly DealForecast[];
	params: ForecastParams;
	scenario: Scenario;
}): ForecastResult {
	const mes1 = monthIndexFromKey(params.mes1);
	const horizonteMeses = params.horizonteMeses;

	const incluidos = deals.filter((deal) =>
		perteneceAEscenario(scenarioFloorOf(deal.scenario), scenario),
	);

	const porDeal = incluidos.map((deal) =>
		projectDeal({ input: deal.input, params, mes1, horizonteMeses }),
	);

	return {
		scenario,
		mes1,
		horizonteMeses,
		engineVersion: ENGINE_VERSION,
		paramsChecksum: paramsChecksum(params),
		dealIds: porDeal.map((p) => p.dealId),
		meses: aggregate({ projections: porDeal, params }),
		porDeal,
	};
}

/**
 * Los cuatro escenarios de una vez, que es como se lee la pantalla de forecast.
 *
 * Cada uno se corre entero y por separado, no se derivan por resta: el rev
 * share depende del SPP consolidado del escenario, asi que el float de
 * Qualified **no** es el de Best Case mas el de los deals que agrega. Restar
 * escenarios daria un numero que no existe.
 */
export function runAllScenarios({
	deals,
	params,
}: {
	deals: readonly DealForecast[];
	params: ForecastParams;
}): Map<Scenario, ForecastResult> {
	const escenarios: readonly Scenario[] = [
		"LIVE",
		"COMMIT",
		"BEST_CASE",
		"QUALIFIED",
	];

	return new Map(
		escenarios.map((scenario) => [
			scenario,
			runForecast({ deals, params, scenario }),
		]),
	);
}
