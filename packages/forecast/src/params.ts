import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import type { RampParams, RevShareTramo, TarifaTramo } from "./types";

/**
 * Los parametros del modelo v3, congelados en docs/forecast-model.md.
 *
 * El checksum es lo que hace auditable reproducir un forecast: un ForecastRun
 * guarda con que checksum y con que ENGINE_VERSION se produjo, asi que se puede
 * decir si dos corridas son comparables sin leer las dos.
 */

const decimalString = z
	.union([z.string(), z.number()])
	.transform((v) => new Decimal(v));

export const forecastParamsSchema = z.object({
	moneda: z.literal("CLP"),
	fxClpUsd: decimalString,
	tpmAnual: decimalString,
	mes1: z.string().regex(/^\d{4}-\d{2}$/),
	horizonteMeses: z.number().int().positive(),

	/** Implementado pero apagado (D9): se usa Cuentas Regimen directo. */
	usarPctActivas: z.boolean(),
	pctActivasDefault: decimalString,

	tarifaMetodoActivo: z.enum(["volumen", "marginal"]),
	tarifaTramos: z.array(
		z.object({
			desde: z.number().int().positive(),
			hasta: z.number().int().positive().nullable(),
			rateClp: decimalString,
		}),
	),

	revShareUmbralMinimoClp: decimalString,
	revShareTramos: z.array(
		z.object({
			desdeClp: decimalString,
			hastaClp: decimalString.nullable(),
			pctTpm: decimalString,
		}),
	),

	/** El revenue variable por cuenta opera con 70% de margen bruto (D12). */
	costoPctRevenueVariable: decimalString,

	rampCvSaldo: z.object({
		arranquePct: decimalString,
		mesesPlanos: z.number().int().nonnegative(),
		factor: decimalString,
	}),
	rampCvCuentas: z.object({
		arranquePct: decimalString,
		mesesPlanos: z.number().int().nonnegative(),
		factor: decimalString,
	}),

	mesesDeSetupDefaultCv: z.number().int().positive(),
	mesesDeSetupDefaultInfra: z.number().int().positive(),

	margenesBrutos: z.object({
		infraRecurrente: decimalString,
		setup: decimalString,
		forwardDeployedEngineers: decimalString,
		cvFee: decimalString,
		float: decimalString,
	}),
});

export type ForecastParams = z.infer<typeof forecastParamsSchema>;

/** La forma que acepta el parser, antes de que zod normalice los Decimal. */
export type ForecastParamsInput = z.input<typeof forecastParamsSchema>;

/**
 * Los parametros vigentes, de la metodologia del 7-oct-2026.
 *
 * Reemplazan al bloque del 12-ago, que es el que reproduce el Excel v4. Las
 * diferencias estan listadas en docs/forecast-model.md: no son correcciones de
 * un error sino un modelo que cambio.
 *
 * Los factores de `rampCvSaldo` y `rampCvCuentas` quedan como fallback: desde
 * octubre el factor se deriva de `Meses de Ramp` de cada deal y estos solo se
 * usan si el campo esta vacio.
 */
export const V3_PARAMS_INPUT: ForecastParamsInput = {
	moneda: "CLP",
	fxClpUsd: "950",
	tpmAnual: "0.045",
	// El horizonte se movio con la metodologia del 7-oct-26: antes arrancaba en
	// ago-26 y eran 29 meses.
	mes1: "2026-09",
	horizonteMeses: 28,

	usarPctActivas: false,
	pctActivasDefault: "0.70",

	tarifaMetodoActivo: "volumen",
	tarifaTramos: [
		{ desde: 1, hasta: 500, rateClp: "760" },
		{ desde: 501, hasta: 1000, rateClp: "618" },
		{ desde: 1001, hasta: 2500, rateClp: "380" },
		{ desde: 2501, hasta: 5000, rateClp: "190" },
		{ desde: 5001, hasta: 10000, rateClp: "119" },
		{ desde: 10001, hasta: 25000, rateClp: "106" },
		{ desde: 25001, hasta: 50000, rateClp: "91" },
		{ desde: 50001, hasta: 100000, rateClp: "76" },
		{ desde: 100001, hasta: 250000, rateClp: "61" },
		{ desde: 250001, hasta: null, rateClp: "46" },
	],

	revShareUmbralMinimoClp: "300000000",
	// Cuatro tramos, no cinco. El "tramo 5" que el Excel v4 ponia en 0% arriba de
	// 40.000 M no existe (Ezequiel, 12-oct-26): el 35% es el ultimo tramo y es
	// abierto. Antes esto se modelaba como dos filas de 35% contiguas, que daba
	// exactamente lo mismo pero dejaba viva la pregunta del cliff.
	revShareTramos: [
		{ desdeClp: "300000000", hastaClp: "2000000000", pctTpm: "0.20" },
		{ desdeClp: "2000000000", hastaClp: "5000000000", pctTpm: "0.25" },
		{ desdeClp: "5000000000", hastaClp: "20000000000", pctTpm: "0.30" },
		{ desdeClp: "20000000000", hastaClp: null, pctTpm: "0.35" },
	],

	costoPctRevenueVariable: "0.30",

	rampCvSaldo: { arranquePct: "0.05", mesesPlanos: 3, factor: "1.145" },
	rampCvCuentas: { arranquePct: "0.05", mesesPlanos: 3, factor: "1.68" },

	mesesDeSetupDefaultCv: 2,
	mesesDeSetupDefaultInfra: 3,

	margenesBrutos: {
		infraRecurrente: "0.65",
		setup: "0.40",
		forwardDeployedEngineers: "0.40",
		// PLACEHOLDER (Ezequiel, 12-oct-26). 0.70 es el complemento de
		// costoPctRevenueVariable (regla del 11-ago), asi que es el valor
		// coherente mientras no haya uno definitivo, pero no esta decidido: la
		// guia del 8-ago marca el margen de CV como pendiente de definir.
		// No escribir un test que fije este numero como si fuera una regla.
		cvFee: "0.70",
		// PLACEHOLDER tambien, por la misma guia del 8-ago.
		float: "0.95",
	},
};

/**
 * Para datos de los que ya se conoce la forma, como el set v3 de este archivo o
 * un override en un test. Para JSON que viene de afuera (la columna `payload`
 * de ForecastParameterSet, por ejemplo) usar `forecastParamsSchema.parse`
 * directamente: ese es el borde de I/O y ahi el valor si es desconocido.
 */
export function parseParams(input: ForecastParamsInput): ForecastParams {
	return forecastParamsSchema.parse(input);
}

export const V3_PARAMS: ForecastParams = parseParams(V3_PARAMS_INPUT);

export function tarifaTramosOf(params: ForecastParams): TarifaTramo[] {
	return params.tarifaTramos.map((t) => ({
		desde: t.desde,
		hasta: t.hasta,
		rateClp: t.rateClp,
	}));
}

export function revShareTramosOf(params: ForecastParams): RevShareTramo[] {
	return params.revShareTramos.map((t) => ({
		desdeClp: t.desdeClp,
		hastaClp: t.hastaClp,
		pctTpm: t.pctTpm,
	}));
}

export function rampParamsOf(
	source: ForecastParams["rampCvSaldo"],
): RampParams {
	return {
		arranquePct: source.arranquePct,
		mesesPlanos: source.mesesPlanos,
		factor: source.factor,
	};
}

/**
 * Checksum de un set de parametros ya parseado.
 *
 * Toma `ForecastParams`, no un objeto cualquiera: el hash describe el modelo,
 * no la forma en que alguien escribio el JSON. Serializa campo por campo en
 * orden fijo, asi que dos entradas que parsean al mismo modelo dan el mismo
 * hash aunque difieran en orden de claves o en si un numero vino como string.
 *
 * Es explicito a proposito. Se puede leer exactamente que entra al hash, que
 * es lo que uno quiere cuando un ForecastRun dice "me produjo este checksum".
 */
export function paramsChecksum(params: ForecastParams): string {
	const tarifa = params.tarifaTramos
		.map((t) => `${t.desde}:${t.hasta ?? "*"}:${t.rateClp.toString()}`)
		.join(",");

	const revShare = params.revShareTramos
		.map(
			(t) =>
				`${t.desdeClp.toString()}:${t.hastaClp?.toString() ?? "*"}:${t.pctTpm.toString()}`,
		)
		.join(",");

	const ramp = (r: ForecastParams["rampCvSaldo"]) =>
		`${r.arranquePct.toString()}:${r.mesesPlanos}:${r.factor.toString()}`;

	const m = params.margenesBrutos;

	const lines = [
		`moneda=${params.moneda}`,
		`fxClpUsd=${params.fxClpUsd.toString()}`,
		`tpmAnual=${params.tpmAnual.toString()}`,
		`mes1=${params.mes1}`,
		`horizonteMeses=${params.horizonteMeses}`,
		`usarPctActivas=${params.usarPctActivas}`,
		`pctActivasDefault=${params.pctActivasDefault.toString()}`,
		`tarifaMetodoActivo=${params.tarifaMetodoActivo}`,
		`tarifaTramos=${tarifa}`,
		`revShareUmbralMinimoClp=${params.revShareUmbralMinimoClp.toString()}`,
		`revShareTramos=${revShare}`,
		`costoPctRevenueVariable=${params.costoPctRevenueVariable.toString()}`,
		`rampCvSaldo=${ramp(params.rampCvSaldo)}`,
		`rampCvCuentas=${ramp(params.rampCvCuentas)}`,
		`mesesDeSetupDefaultCv=${params.mesesDeSetupDefaultCv}`,
		`mesesDeSetupDefaultInfra=${params.mesesDeSetupDefaultInfra}`,
		`margenInfraRecurrente=${m.infraRecurrente.toString()}`,
		`margenSetup=${m.setup.toString()}`,
		`margenFde=${m.forwardDeployedEngineers.toString()}`,
		`margenCvFee=${m.cvFee.toString()}`,
		`margenFloat=${m.float.toString()}`,
	];

	return createHash("sha256").update(lines.join("\n")).digest("hex");
}
