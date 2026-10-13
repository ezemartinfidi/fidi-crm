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
	if (deal.forecastCategory === "PIPELINE") return "QUALIFIED";

	// **Sin categoria no entra a ningun escenario, ni siquiera a Qualified.**
	// Un deal con fecha de cierre pero sin categoria es invisible para el
	// forecast, y eso es a proposito: el modelo de agosto lo metia en Qualified
	// y hacia que un dato faltante pareciera una decision de pipeline.
	//
	// El costo es que se puede perder plata sin que nada falle, asi que la
	// metodologia del 7-oct pide revisar periodicamente los deals sin
	// categoria. En el CRM eso deberia ser una vista, no una costumbre.
	return null;
}

/** Si un deal con ese piso entra al escenario pedido. */
export function perteneceAEscenario(
	floor: Scenario | null,
	escenario: Scenario,
): boolean {
	if (floor === null) return false;
	return SCENARIO_ORDER.indexOf(floor) <= SCENARIO_ORDER.indexOf(escenario);
}
