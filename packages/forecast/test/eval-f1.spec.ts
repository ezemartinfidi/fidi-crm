import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { monthIndexFromKey } from "../src/month";
import { parseParams, revShareTramosOf, V3_PARAMS_INPUT } from "../src/params";
import { pctTpmFor } from "../src/revshare";
import { ANCHO, findRow, loadSheet, parseSerie } from "./fixtures/parse";
import { loadPipeline } from "./fixtures/pipeline";

/**
 * El fixture del Excel v4 (11-ago-2026).
 *
 * **Ya no es la referencia del modelo.** La metodologia del 7-oct-2026 cambio
 * cinco reglas, asi que el motor y esta planilla describen modelos distintos a
 * proposito y compararlos deal por deal no mide nada. Ver "Esta especificacion
 * quedo vieja" en docs/forecast-model.md.
 *
 * Lo que el archivo sigue aportando, y por eso se conserva:
 *
 * - **El parser del volcado.** Si el ancho se desconfigura las filas se corren
 *   una columna y los datos quedan plausibles y mal, que es el peor resultado
 *   posible. Dos oportunidades conocidas lo fijan.
 * - **La prueba del bug del float**, que es autocontenida: se contrasta el
 *   float del Excel contra su propio SPP, sin meter al motor en el medio.
 *
 * EVAL-F1 como compuerta necesita un fixture nuevo: la tabla mensual de la
 * seccion "Proyeccion vigente" del 7-oct, que es la salida que el equipo
 * mantiene. Para construirla hace falta el extract de Notion (fase 3).
 */

// La planilla se calculo con TPM 4,75%; produccion usa 4,5%.
const TPM_DEL_EXCEL = "0.0475";
const PARAMS = parseParams({ ...V3_PARAMS_INPUT, tpmAnual: TPM_DEL_EXCEL });
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

describe("el bug del float de la planilla", () => {
	// Se mide contra el propio SPP del Excel, sin pasar por el motor: asi la
	// prueba sobrevive a cualquier cambio del modelo, que es justo lo que
	// acaba de pasar.
	it("usa TPM al cuadrado donde va TPM, y por eso queda 21 veces abajo", () => {
		const spp = parseSerie(findRow(REVENUE, "SPP consolidado") ?? []);
		const float = parseSerie(findRow(REVENUE, "comp: Float") ?? []);
		const tpm = new Decimal(TPM_DEL_EXCEL);
		const tramos = revShareTramosOf(PARAMS);

		let medidos = 0;
		for (let i = 0; i < spp.length; i++) {
			const saldo = spp[i];
			const pagado = float[i];
			if (saldo === undefined || pagado === undefined) continue;
			if (saldo.isZero() || pagado.isZero()) continue;

			const correcto = saldo
				.times(tpm.dividedBy(12))
				.times(pctTpmFor(tramos, saldo));

			// La planilla multiplica por la TPM una vez de mas.
			const conBug = correcto.times(tpm);
			expect(
				pagado.minus(conBug).abs().dividedBy(conBug).lessThan("0.001"),
			).toBe(true);
			medidos++;
		}

		expect(medidos).toBeGreaterThan(20);
	});
});
