import type { DealScenarioInput } from "./deal-input";
import type { Scenario } from "./types";

/**
 * Los escenarios son **acumulativos**: cada uno incluye a los anteriores. El
 * total de Qualified contiene a Best Case, que contiene a Commit, que contiene
 * a Live.
 *
 * Son categoricos y **no usan probabilidades**. El pipeline ponderado por etapa
 * es una segunda vista y se mantiene aparte, porque mezclarlos descuenta dos
 * veces: un deal en Commit ya expresa una apuesta, multiplicarlo ademas por el
 * 75% de Negotiation lo castiga de nuevo.
 */
export const SCENARIO_ORDER = [
	"LIVE",
	"COMMIT",
	"BEST_CASE",
	"QUALIFIED",
] as const satisfies readonly Scenario[];

/**
 * El escenario mas restrictivo al que entra un deal, o null si no entra a
 * ninguno. Por ser acumulativos, un deal con piso LIVE aparece en los cuatro.
 *
 * La **regla anti doble conteo**: si el deal esta ganado es LIVE y se ignora su
 * Forecast Category. Sin esto un Won marcado Commit se contaria en los dos
 * lados cuando alguien sume escenarios en vez de anidarlos.
 */
export function scenarioFloorOf(deal: DealScenarioInput): Scenario | null {
	// Sin Expected Close no hay donde anclar el timing: no proyecta.
	if (deal.closeMonth === null) return null;

	if (deal.estado === "LOST" || deal.estado === "STAND_BY") return null;
	if (deal.estado === "WON") return "LIVE";

	if (deal.forecastCategory === "OMITIR") return null;
	if (deal.forecastCategory === "COMMIT") return "COMMIT";
	if (deal.forecastCategory === "BEST_CASE") return "BEST_CASE";

	// Pipeline explicito o sin categoria cargada. Las dos cosas son Qualified.
	return "QUALIFIED";
}

/** Si un deal con ese piso entra al escenario pedido. */
export function perteneceAEscenario(
	floor: Scenario | null,
	escenario: Scenario,
): boolean {
	if (floor === null) return false;
	return SCENARIO_ORDER.indexOf(floor) <= SCENARIO_ORDER.indexOf(escenario);
}
