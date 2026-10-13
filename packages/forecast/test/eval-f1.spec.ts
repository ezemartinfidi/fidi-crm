import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { runForecast } from "../src/engine";
import { monthIndexFromKey } from "../src/month";
import { parseParams, V3_PARAMS_INPUT } from "../src/params";
import { projectDeal } from "../src/project";
import { perteneceAEscenario, scenarioFloorOf } from "../src/scenarios";
import { ANCHO, findRow, loadSheet, parseSerie } from "./fixtures/parse";
import { loadPipeline } from "./fixtures/pipeline";

/**
 * EVAL-F1 — contrastar contra `Fidi_Revenue_Model_v4_Notion.xlsx`.
 *
 * Lo que se valida es lo que el Excel calcula bien, que despues de dos rondas
 * de analisis resulto ser casi todo:
 *
 * - El **SPP consolidado** coincide exacto en los 29 meses. Es la validacion
 *   mas fuerte que hay del ramp de saldo y de la agregacion en dos pasadas.
 * - De las oportunidades del escenario que la planilla muestra, 24 de 25 caen
 *   dentro del 0,2%.
 *
 * Lo que **no** se compara es la fila de float, porque el Excel la calcula mal:
 * multiplica por la TPM una vez de mas y queda 21 veces por debajo. Ver "El
 * Excel subestima el float por 21x" en docs/forecast-model.md. Hacer que el
 * motor coincida ahi seria copiar el bug.
 */

// El Excel se calculo con TPM 4,75%; produccion usa 4,5% (confirmado 12-oct-26).
// El override es del escalar, no un parameter set aparte: es la unica
// diferencia que queda, y el tramo 5 no importa porque el SPP consolidado del
// modelo llega a 35.500 M y nunca cruza los 40.000 M del cliff.
const PARAMS = parseParams({ ...V3_PARAMS_INPUT, tpmAnual: "0.0475" });
const MES1 = monthIndexFromKey(PARAMS.mes1);

const PIPELINE = loadPipeline(MES1);
const REVENUE = loadSheet("v4-revenue.raw.txt", ANCHO.revenue);

/** La seccion C del Excel: una fila por oportunidad, MRR + setup, sin float. */
function porOportunidad(): Map<string, Decimal[]> {
	const salida = new Map<string, Decimal[]>();
	for (const fila of REVENUE) {
		const etiqueta = fila[0]?.trim() ?? "";
		if (etiqueta.includes(" · ") && fila.length >= ANCHO.revenue) {
			salida.set(etiqueta, parseSerie(fila));
		}
	}
	return salida;
}

describe("el fixture del Excel v4", () => {
	it("parsea las oportunidades con las columnas alineadas", () => {
		// El volcado aplano los saltos de linea a espacios y hay texto sin
		// comillas que tambien los tiene. Si el ancho se desconfigura, las filas
		// se corren una columna y los datos quedan plausibles pero mal: este
		// test es lo unico que lo detecta.
		expect(PIPELINE.length).toBeGreaterThan(100);

		const aramark = PIPELINE.find(
			(f) => f.oportunidad === "Aramark — AramarkPay (legacy)",
		);
		expect(aramark?.cliente).toBe("Aramark");
		expect(aramark?.deal.scenario.estado).toBe("WON");

		const monnet = PIPELINE.find((f) => f.cliente === "Monnet");
		expect(monnet?.deal.input.cuentasRegimen).toBe(5000);
		expect(monnet?.deal.input.saldoVistaMaxClp?.toString()).toBe("4000000000");
		expect(monnet?.deal.input.mesesDeRamp).toBe(12);
		expect(monnet?.deal.input.recurringRule).toBe("PISO");
	});

	it("trae las cuatro series de escenario de la seccion B", () => {
		for (const etiqueta of [
			"1 · LIVE (Won)",
			"2 · + COMMIT",
			"3 · + BEST CASE",
			"4 · + PIPELINE",
		]) {
			const fila = findRow(REVENUE, etiqueta);
			expect(fila).toBeDefined();
			expect(parseSerie(fila ?? [])).toHaveLength(29);
		}
	});

	it("el SPP consolidado nunca cruza los 40.000 M, asi que el cliff no aplica", () => {
		const fila = findRow(REVENUE, "SPP consolidado");
		const maximo = parseSerie(fila ?? []).reduce(
			(a, b) => Decimal.max(a, b),
			new Decimal(0),
		);
		expect(maximo.greaterThan("30000000000")).toBe(true);
		expect(maximo.lessThan("40000000000")).toBe(true);
	});
});

describe("EVAL-F1 — contraste por oportunidad", () => {
	const esperados = porOportunidad();

	/**
	 * La seccion C de la planilla es del escenario 2, "+ COMMIT". Un deal de
	 * Best Case o Pipeline figura con la fila en blanco, asi que compararlo
	 * reportaria una diferencia que no existe.
	 */
	const comparables = PIPELINE.filter(
		(f) =>
			esperados.has(f.deal.input.dealId) &&
			perteneceAEscenario(scenarioFloorOf(f.deal.scenario), "COMMIT"),
	);

	/** El peor desvio relativo de un deal a lo largo del horizonte. */
	function peorDesvio(fila: (typeof PIPELINE)[number]): Decimal {
		const esperado = esperados.get(fila.deal.input.dealId) ?? [];
		const proyectado = projectDeal({
			input: fila.deal.input,
			params: PARAMS,
			mes1: MES1,
			horizonteMeses: PARAMS.horizonteMeses,
		});

		let peor = new Decimal(0);
		for (let i = 0; i < esperado.length; i++) {
			const esp = esperado[i];
			const celda = proyectado.meses[i];
			if (esp === undefined || celda === undefined) continue;

			// La seccion C es MRR + setup, sin float.
			const obt = celda.recurrente.plus(celda.setup);
			const abs = obt.minus(esp).abs();
			const rel = esp.isZero()
				? abs.isZero()
					? new Decimal(0)
					: new Decimal(1)
				: abs.dividedBy(esp);
			peor = Decimal.max(peor, rel);
		}
		return peor;
	}

	const desvios = comparables.map((f) => ({
		id: f.deal.input.dealId,
		peor: peorDesvio(f),
	}));

	it("compara contra las oportunidades del escenario que la planilla muestra", () => {
		expect(comparables.length).toBeGreaterThanOrEqual(25);
	});

	it("reproduce al menos 24 de 25 dentro del 0,2% de tolerancia", () => {
		// Medido el 13-oct-26, despues de resolver que el minimo rampa en
		// Infraestructura y de despejar la escalera del Excel. Si baja, algo del
		// motor se rompio; si sube, actualizar el numero.
		const dentro = desvios.filter((d) => d.peor.lessThan("0.002")).length;
		expect(dentro).toBeGreaterThanOrEqual(24);
	});

	it("la unica que queda afuera no se pasa del 15%", () => {
		// Entel · BaaS para tarjeta de credito, 12%. Es la ultima diferencia
		// sin explicar y no tiene todavia una hipotesis que la cubra.
		const afuera = desvios.filter((d) => d.peor.greaterThanOrEqualTo("0.002"));
		expect(afuera).toHaveLength(1);
		expect(afuera[0]?.peor.lessThan("0.15")).toBe(true);
	});
});

describe("EVAL-F1 — el SPP consolidado, que es lo que valida la agregacion", () => {
	it("coincide con el Excel en los 29 meses", () => {
		// La prueba mas fuerte del motor: el saldo de cada deal rampa igual y la
		// suma de todos los del escenario da el mismo numero que la planilla.
		// Es tambien lo que deja claro que el error del float no esta en el SPP.
		const esperado = parseSerie(findRow(REVENUE, "SPP consolidado") ?? []);
		const corrida = runForecast({
			deals: PIPELINE.map((f) => f.deal),
			params: PARAMS,
			scenario: "COMMIT",
		});

		for (let i = 0; i < esperado.length; i++) {
			const esp = esperado[i];
			const obt = corrida.meses[i]?.sppConsolidado;
			if (esp === undefined || obt === undefined || esp.isZero()) continue;

			const rel = obt.minus(esp).abs().dividedBy(esp);
			expect(rel.lessThan("0.0001")).toBe(true);
		}
	});

	it("el float del Excel esta 21 veces por debajo, y el motor no copia el bug", () => {
		// 1/0,0475 = 21,0526. La planilla multiplica por la TPM una vez de mas.
		// Si algun dia alguien "arregla" el motor para que coincida, este test
		// lo frena y el comentario explica por que.
		const esperado = parseSerie(findRow(REVENUE, "comp: Float") ?? []);
		const corrida = runForecast({
			deals: PIPELINE.map((f) => f.deal),
			params: PARAMS,
			scenario: "COMMIT",
		});

		const ratios: Decimal[] = [];
		for (let i = 0; i < esperado.length; i++) {
			const esp = esperado[i];
			const obt = corrida.meses[i]?.float;
			if (esp === undefined || obt === undefined || esp.isZero()) continue;
			ratios.push(obt.dividedBy(esp));
		}

		expect(ratios.length).toBeGreaterThan(20);
		const unoSobreTpm = new Decimal(1).dividedBy(PARAMS.tpmAnual);
		for (const ratio of ratios) {
			expect(ratio.minus(unoSobreTpm).abs().lessThan("0.01")).toBe(true);
		}
	});
});
