import type Decimal from "decimal.js";

/** Un mes calendario como indice absoluto: año × 12 + (mes − 1). */
export type MonthIndex = number;

export type TarifaMethod = "volumen" | "marginal";

export type RevenueLine =
	| "CUENTAS_VIRTUALES"
	| "FORWARD_DEPLOYED_ENGINEERS"
	| "INFRAESTRUCTURA";

export type RecurringRule = "PISO" | "ADITIVO";

export type ForecastCategory = "COMMIT" | "BEST_CASE" | "PIPELINE" | "OMITIR";

export type Scenario = "LIVE" | "COMMIT" | "BEST_CASE" | "QUALIFIED";

/** Un tramo de tarifa: desde y hasta cuentas, con el rate en CLP por cuenta. */
export type TarifaTramo = {
	desde: number;
	/** null = sin techo. */
	hasta: number | null;
	rateClp: Decimal;
};

/** Un tramo de rev share: desde y hasta de saldo, con el % de la TPM. */
export type RevShareTramo = {
	desdeClp: Decimal;
	hastaClp: Decimal | null;
	pctTpm: Decimal;
};

export type RampParams = {
	/** Fraccion del tope que se alcanza en cada uno de los meses planos. */
	arranquePct: Decimal;
	/** Cuantos meses quedan planos antes de componer. */
	mesesPlanos: number;
	/** Factor compuesto a partir del mes siguiente a los planos. */
	factor: Decimal;
};
