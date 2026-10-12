import type Decimal from "decimal.js";
import type {
	DealEstado,
	DealForecast,
	ProductoComponentes,
} from "../../src/deal-input";
import type { ForecastCategory, RecurringRule } from "../../src/types";
import { ANCHO, loadSheet, parseEntero, parseMonto } from "./parse";

/**
 * Las oportunidades del Excel v4, traducidas a entradas del motor.
 *
 * El Excel ya expresa el Mes Close como **indice relativo** (1 = Ago-26, los
 * negativos son pasado), que es justo lo que usa el motor, asi que no hay que
 * parsear fechas ni pelear con husos horarios.
 */

/** Las columnas de la hoja Pipeline, en orden. */
const COL = {
	cliente: 0,
	oportunidad: 1,
	productos: 2,
	cv: 3,
	status: 4,
	forecastCat: 5,
	mesClose: 7,
	cuotasSetup: 8,
	setupFee: 9,
	regla: 12,
	ctasRegimen: 13,
	saldoVistaMax: 14,
	ramp: 15,
	minimo: 16,
	finContrato: 21,
} as const;

/** El mes 1 del Excel es Ago-26. El motor usa indices absolutos. */
export function mesExcelAIndice(
	mesExcel: number,
	mes1Absoluto: number,
): number {
	return mes1Absoluto + (mesExcel - 1);
}

function estadoDe(status: string): DealEstado {
	const s = status.trim().toLowerCase();
	if (s === "won") return "WON";
	if (s === "lost") return "LOST";
	if (s.includes("stand")) return "STAND_BY";
	return "ABIERTO";
}

/**
 * La categoria viene con un emoji adelante que el volcado dejo mal codificado
 * (`ð¢ Commit`), asi que se matchea por la palabra y no por el string entero.
 */
function categoriaDe(celda: string): ForecastCategory | null {
	const c = celda.toLowerCase();
	if (c.includes("omitir")) return "OMITIR";
	if (c.includes("commit")) return "COMMIT";
	if (c.includes("best")) return "BEST_CASE";
	if (c.includes("pipeline")) return "PIPELINE";
	return null;
}

function reglaDe(celda: string): RecurringRule | null {
	const c = celda.toLowerCase();
	if (c.startsWith("piso")) return "PISO";
	if (c.startsWith("aditivo")) return "ADITIVO";
	return null;
}

/**
 * Los componentes del producto. La columna `CV` del Excel es la que distingue
 * Cuentas Virtuales, y es la misma distincion que hace la matriz: CV cobra
 * float y opera en modo piso, el resto suma al minimo.
 *
 * Forward Deployed Engineers no cobra por cuenta ni minimo, pero en el Excel
 * eso se expresa dejando esas celdas vacias, asi que el motor llega al mismo
 * resultado sin un caso especial.
 */
function productosDe(celdaCv: string, nombres: string): ProductoComponentes[] {
	const esCv = celdaCv.trim() === "1";
	if (esCv) {
		return [
			{
				revenueLine: "CUENTAS_VIRTUALES",
				porCuenta: true,
				float: true,
				modo: "PISO",
			},
		];
	}

	const esFde = nombres.toLowerCase().includes("forward deployed");
	return [
		{
			revenueLine: esFde ? "FORWARD_DEPLOYED_ENGINEERS" : "INFRAESTRUCTURA",
			porCuenta: !esFde,
			float: false,
			modo: "ADITIVO",
		},
	];
}

export type FilaPipeline = {
	readonly deal: DealForecast;
	readonly cliente: string;
	readonly oportunidad: string;
	/** El MRR de regimen que el Excel ya calculo, para contrastar por deal. */
	readonly mrrRegimenExcel: Decimal | null;
};

/**
 * Lee la hoja Pipeline. Una fila cuenta como oportunidad si tiene cliente y un
 * Mes Close numerico; el resto son titulos, notas y filas de relleno del
 * volcado.
 *
 * Una oportunidad **sin Mes Close no se descarta aca**: se le deja
 * `closeMonth: null` y es `scenarioFloorOf` quien la excluye, que es donde vive
 * esa regla.
 */
export function loadPipeline(mes1Absoluto: number): FilaPipeline[] {
	const filas = loadSheet("v4-pipeline.raw.txt", ANCHO.pipeline);
	const salida: FilaPipeline[] = [];

	for (const fila of filas) {
		const cliente = fila[COL.cliente]?.trim() ?? "";
		const oportunidad = fila[COL.oportunidad]?.trim() ?? "";
		if (cliente === "" || cliente === "Cliente") continue;
		if (oportunidad === "") continue;

		const status = fila[COL.status] ?? "";
		if (status.trim() === "") continue;

		const mesExcel = parseEntero(fila[COL.mesClose]);
		const closeMonth =
			mesExcel === null ? null : mesExcelAIndice(mesExcel, mes1Absoluto);

		const finExcel = parseEntero(fila[COL.finContrato]);
		const dealId = `${cliente} · ${oportunidad}`;

		salida.push({
			cliente,
			oportunidad,
			mrrRegimenExcel: parseMonto(fila[17]),
			deal: {
				scenario: {
					dealId,
					estado: estadoDe(status),
					forecastCategory: categoriaDe(fila[COL.forecastCat] ?? ""),
					closeMonth,
				},
				input: {
					dealId,
					// Sin Close el deal no proyecta; el 0 nunca se usa porque
					// scenarioFloorOf lo saca antes.
					closeMonth: closeMonth ?? 0,
					productos: productosDe(
						fila[COL.cv] ?? "0",
						fila[COL.productos] ?? "",
					),
					cuentasRegimen: parseEntero(fila[COL.ctasRegimen]),
					saldoVistaMaxClp: parseMonto(fila[COL.saldoVistaMax]),
					mesesDeRamp: parseEntero(fila[COL.ramp]),
					minimoMensualClp: parseMonto(fila[COL.minimo]),
					setupFeeClp: parseMonto(fila[COL.setupFee]),
					mesesDeSetup: parseEntero(fila[COL.cuotasSetup]),
					mrrFijoClp: null,
					mrrFijoMeses: null,
					finContratoMonth:
						finExcel === null ? null : mesExcelAIndice(finExcel, mes1Absoluto),
					recurringRule: reglaDe(fila[COL.regla] ?? ""),
				},
			},
		});
	}

	return salida;
}
