import { z } from "zod";

export const forecastScenario = z.enum([
	"LIVE",
	"COMMIT",
	"BEST_CASE",
	"QUALIFIED",
]);

export const forecastRevenueLine = z.enum([
	"CUENTAS_VIRTUALES",
	"FORWARD_DEPLOYED_ENGINEERS",
	"INFRAESTRUCTURA",
]);

/**
 * Los montos viajan como string, no como number.
 *
 * El motor trabaja en `decimal.js` justamente porque el punto flotante desvia
 * mas alla de la tolerancia en una serie de 29 meses encadenados. Serializarlos
 * a number tiraria esa precision en el ultimo metro.
 */
const monto = z.string();

export const forecastMonthOutput = z.object({
	monthIndex: z.number().int(),
	monthKey: z.string(),
	setup: monto,
	recurrente: monto,
	float: monto,
	total: monto,
	/** El SPP consolidado que produjo ese float. */
	sppConsolidado: monto,
	cuentas: monto,
	porLinea: z.array(
		z.object({ revenueLine: forecastRevenueLine, total: monto }),
	),
});

export const forecastRunOutput = z.object({
	scenario: forecastScenario,
	mes1: z.string(),
	horizonteMeses: z.number().int(),
	engineVersion: z.string(),
	paramsChecksum: z.string(),
	parameterSetVersion: z.string(),
	dealIds: z.array(z.string()),
	meses: z.array(forecastMonthOutput),
});

export const projectInput = z.object({
	scenario: forecastScenario.optional(),
	/** La version del parameter set. Sin ella se usa el que esta ACTIVE. */
	parameterSetVersion: z.string().optional(),
});

export const projectAllOutput = z.array(forecastRunOutput);

export const dealForecastInput = z.object({ dealId: z.string() });

export const dealForecastOutput = z.object({
	dealId: z.string(),
	revenueLine: forecastRevenueLine,
	/** El MRR de regimen: la base de bookings, distinta de la facturacion. */
	mrrDeRegimen: monto,
	meses: z.array(
		z.object({
			monthIndex: z.number().int(),
			monthKey: z.string(),
			setup: monto,
			recurrente: monto,
			minimo: monto,
			porCuenta: monto,
			mrrFijo: monto,
			/** Lo que aporta al SPP consolidado, no su float. */
			saldoFloat: monto,
			cuentas: monto,
		}),
	),
});
