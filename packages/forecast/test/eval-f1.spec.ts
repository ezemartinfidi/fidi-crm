import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { monthIndexFromKey } from "../src/month";
import { parseParams, V3_PARAMS_INPUT } from "../src/params";
import { projectDeal } from "../src/project";
import { ANCHO, findRow, loadSheet, parseSerie } from "./fixtures/parse";
import { loadPipeline } from "./fixtures/pipeline";

/**
 * EVAL-F1 — reproducir `Fidi_Revenue_Model_v4_Notion.xlsx`.
 *
 * **Todavia no es la compuerta.** Hoy 59 de 122 oportunidades reproducen el
 * Excel exacto y 17 mas caen dentro del 0,2% de tolerancia; las 46 restantes
 * difieren por una regla que el Excel y la especificacion **no comparten**, no
 * por un bug. Ver "El Excel rampa el minimo" en docs/forecast-model.md.
 *
 * Mientras eso no se decida, este archivo cumple dos funciones que igual valen:
 * fija que el fixture se siga parseando alineado, y fija el piso de 59 exactos
 * para que un cambio en el motor no lo baje sin que nadie se entere.
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

	const comparables = PIPELINE.filter((f) =>
		esperados.has(f.deal.input.dealId),
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

	it("compara contra la mayoria de las oportunidades del Excel", () => {
		expect(comparables.length).toBeGreaterThan(110);
	});

	it("reproduce exacto al menos 59 oportunidades", () => {
		// El piso medido el 12-oct-26. Si baja, algo del motor se rompio; si
		// sube, actualizar el numero y celebrarlo.
		const exactos = desvios.filter((d) => d.peor.lessThan("0.000001")).length;
		expect(exactos).toBeGreaterThanOrEqual(59);
	});

	it("deja a lo sumo 46 oportunidades con diferencia estructural", () => {
		// Son las del minimo rampado. No se "arreglan" haciendo que el motor
		// imite al Excel: la especificacion dice lo contrario a proposito.
		const estructurales = desvios.filter((d) =>
			d.peor.greaterThan("0.05"),
		).length;
		expect(estructurales).toBeLessThanOrEqual(46);
	});

	it("las diferencias chicas se quedan dentro del 0,2% de tolerancia", () => {
		const ruido = desvios.filter(
			(d) => d.peor.greaterThan("0.000001") && d.peor.lessThanOrEqualTo("0.05"),
		);
		for (const d of ruido) {
			expect(d.peor.lessThan("0.002")).toBe(true);
		}
	});
});
