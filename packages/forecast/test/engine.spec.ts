import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { aggregate } from "../src/aggregate";
import { componentesDelMes, goLiveOf } from "../src/components";
import type {
	DealForecast,
	DealForecastInput,
	ProductoComponentes,
} from "../src/deal-input";
import { ENGINE_VERSION, runAllScenarios, runForecast } from "../src/engine";
import { monthIndexFromKey } from "../src/month";
import { V3_PARAMS } from "../src/params";
import { projectDeal } from "../src/project";
import { scenarioFloorOf } from "../src/scenarios";

const PARAMS = V3_PARAMS;
const MES1 = monthIndexFromKey(PARAMS.mes1);
const HORIZONTE = PARAMS.horizonteMeses;

const CUENTAS_VIRTUALES: ProductoComponentes = {
	revenueLine: "CUENTAS_VIRTUALES",
	porCuenta: true,
	float: true,
	modo: "PISO",
};

const CORE_DE_CUENTAS: ProductoComponentes = {
	revenueLine: "INFRAESTRUCTURA",
	porCuenta: true,
	float: false,
	modo: "ADITIVO",
};

const FDE: ProductoComponentes = {
	revenueLine: "FORWARD_DEPLOYED_ENGINEERS",
	porCuenta: false,
	float: false,
	modo: "ADITIVO",
};

function deal(over: Partial<DealForecastInput> = {}): DealForecastInput {
	return {
		dealId: "d1",
		closeMonth: monthIndexFromKey("2026-08"),
		productos: [CUENTAS_VIRTUALES],
		cuentasRegimen: 10_000,
		saldoVistaMaxClp: new Decimal("1000000000"),
		mesesDeRamp: null,
		mesesPlanosRamp: null,
		minimoMensualClp: new Decimal("5000000"),
		setupFeeClp: new Decimal("12000000"),
		mesesDeSetup: 2,
		mrrFijoClp: null,
		mrrFijoMeses: null,
		finContratoMonth: null,
		recurringRule: null,
		...over,
	};
}

function won(input: DealForecastInput): DealForecast {
	return {
		scenario: {
			dealId: input.dealId,
			estado: "WON",
			forecastCategory: null,
			closeMonth: input.closeMonth,
		},
		input,
	};
}

const proyectar = (input: DealForecastInput) =>
	projectDeal({ input, params: PARAMS, mes1: MES1, horizonteMeses: HORIZONTE });

const celda = (input: DealForecastInput, mes: number) =>
	componentesDelMes({ mes, input, params: PARAMS });

describe("timing del deal", () => {
	it("el go-live es el mes siguiente a la ultima cuota de setup", () => {
		const d = deal({ mesesDeSetup: 2 });
		expect(goLiveOf(d, PARAMS)).toBe(d.closeMonth + 3);
	});

	it("en Cuentas Virtuales, sin meses de setup cargados usa el default de 2", () => {
		const d = deal({ mesesDeSetup: null });
		expect(goLiveOf(d, PARAMS)).toBe(d.closeMonth + 3);
	});

	it("fuera de Cuentas Virtuales, sin meses de setup carga el default de 3", () => {
		const d = deal({ productos: [FDE], mesesDeSetup: null });
		expect(goLiveOf(d, PARAMS)).toBe(d.closeMonth + 4);
	});

	it("cero meses de setup no es lo mismo que vacio", () => {
		// Cero es valido y significa go-live el mes siguiente al cierre; vacio
		// aplica el default de la linea. Tratarlos igual correria el go-live
		// tres meses en cada deal de Infra que puso cero a proposito.
		const cero = deal({ productos: [FDE], mesesDeSetup: 0 });
		const vacio = deal({ productos: [FDE], mesesDeSetup: null });

		expect(goLiveOf(cero, PARAMS)).toBe(cero.closeMonth + 1);
		expect(goLiveOf(vacio, PARAMS)).toBe(vacio.closeMonth + 4);
	});

	it("no factura recurrente antes del go-live", () => {
		const d = deal();
		const goLive = goLiveOf(d, PARAMS);
		expect(celda(d, goLive - 1).recurrente.isZero()).toBe(true);
		expect(celda(d, goLive).recurrente.isZero()).toBe(false);
	});
});

describe("EVAL-F6 — criterio minimo-floor", () => {
	it("el minimo se factura completo desde el go-live, sin rampar", () => {
		// Con modo PISO y una variable chica al principio, gana el minimo entero.
		const d = deal({
			cuentasRegimen: 100,
			minimoMensualClp: new Decimal("5000000"),
		});
		const goLive = goLiveOf(d, PARAMS);

		// Mes 1 del ramp: 5% de 100 cuentas son 5, muy por debajo del minimo.
		const primera = celda(d, goLive);
		expect(primera.recurrente.toString()).toBe("5000000");
	});

	it("rampar el minimo seria el error: el primer mes no vale el 5% del minimo", () => {
		const d = deal({ cuentasRegimen: 100 });
		const goLive = goLiveOf(d, PARAMS);
		const rampado = new Decimal("5000000").times("0.05");

		expect(celda(d, goLive).recurrente.equals(rampado)).toBe(false);
	});

	it("en modo aditivo suma el minimo y la variable; en piso toma el mayor", () => {
		const base = { cuentasRegimen: 10_000, minimoMensualClp: new Decimal(1) };
		// Un mes con los dos ramps al tope, para comparar solo la combinacion.
		const enRegimen = monthIndexFromKey("2028-06");
		const aditivo = celda(
			deal({ ...base, productos: [CORE_DE_CUENTAS], recurringRule: "ADITIVO" }),
			enRegimen,
		);
		const piso = celda(deal({ ...base, recurringRule: "PISO" }), enRegimen);

		expect(aditivo.recurrente.toString()).toBe(
			aditivo.minimo.plus(aditivo.porCuenta).toString(),
		);
		expect(piso.recurrente.toString()).toBe(piso.porCuenta.toString());
	});

	it("el minimo no rampa en ninguna linea: se factura completo desde el go-live", () => {
		// La rampa es de cuentas y de saldo, no del piso que el cliente paga.
		// El modelo de agosto rampaba el minimo en Infraestructura; la
		// metodologia del 7-oct no, y es la vigente.
		const infra = deal({
			productos: [CORE_DE_CUENTAS],
			cuentasRegimen: null,
			saldoVistaMaxClp: null,
			minimoMensualClp: new Decimal("2000000"),
			mesesDeRamp: null,
		});
		const cv = deal({
			cuentasRegimen: null,
			saldoVistaMaxClp: new Decimal("1000"),
			minimoMensualClp: new Decimal("2000000"),
		});

		for (const d of [infra, cv]) {
			expect(celda(d, goLiveOf(d, PARAMS)).minimo.toString()).toBe("2000000");
		}
	});
});

describe("la tarifa se fija con Cuentas Regimen", () => {
	it("durante la rampa se cobra la tarifa del regimen, no la del mes", () => {
		// Un deal que va a 100.000 cuentas paga 76 CLP desde el primer mes,
		// aunque ese mes tenga 5.000 y la tabla diga 190 para ese volumen.
		// El modelo de agosto re-tarifaba mes a mes, lo que hacia caer el
		// ingreso por cuenta al avanzar la rampa: al reves del contrato.
		const d = deal({
			productos: [CORE_DE_CUENTAS],
			cuentasRegimen: 100_000,
			saldoVistaMaxClp: null,
			minimoMensualClp: null,
			mesesDeRamp: 10,
		});

		const goLive = goLiveOf(d, PARAMS);
		const primero = celda(d, goLive);
		const regimen = celda(d, goLive + 20);

		expect(primero.cuentas.lessThan(regimen.cuentas)).toBe(true);
		// El rate por cuenta es el mismo en los dos meses.
		expect(primero.porCuenta.dividedBy(primero.cuentas).toFixed(4)).toBe(
			regimen.porCuenta.dividedBy(regimen.cuentas).toFixed(4),
		);
		expect(regimen.porCuenta.dividedBy(regimen.cuentas).toFixed(0)).toBe("76");
	});
});

describe("EVAL-F7 — Fin Contrato", () => {
	it("corta el recurrente en ese mes inclusive", () => {
		const fin = monthIndexFromKey("2027-06");
		const d = deal({ finContratoMonth: fin });

		expect(celda(d, fin).recurrente.isZero()).toBe(false);
		expect(celda(d, fin + 1).recurrente.isZero()).toBe(true);
	});

	it("deja los setup fees intactos", () => {
		// El fin cae antes de que termine el setup: las cuotas siguen igual.
		const close = monthIndexFromKey("2026-08");
		const conFin = deal({ closeMonth: close, finContratoMonth: close });
		const sinFin = deal({ closeMonth: close });

		for (const mes of [close + 1, close + 2]) {
			expect(celda(conFin, mes).setup.toString()).toBe(
				celda(sinFin, mes).setup.toString(),
			);
			expect(celda(conFin, mes).setup.isZero()).toBe(false);
		}
	});

	it("tambien corta el float y las cuentas, no solo el fee", () => {
		const fin = monthIndexFromKey("2027-06");
		const d = deal({ finContratoMonth: fin });

		expect(celda(d, fin + 1).saldoFloat.isZero()).toBe(true);
		expect(celda(d, fin + 1).cuentas.isZero()).toBe(true);
	});
});

describe("EVAL-F2 — mrr fijo", () => {
	it("en null aporta 0 y no rompe la proyeccion", () => {
		const p = proyectar(deal({ mrrFijoClp: null }));
		expect(p.meses).toHaveLength(HORIZONTE);
		expect(p.meses.every((m) => m.mrrFijo.isZero())).toBe(true);
	});

	it("con duracion se corta despues de esos meses", () => {
		// Hites Core de Credito: 15K por 10 meses.
		const d = deal({
			mrrFijoClp: new Decimal("15000"),
			mrrFijoMeses: 10,
		});
		const goLive = goLiveOf(d, PARAMS);

		expect(celda(d, goLive).mrrFijo.toString()).toBe("15000");
		expect(celda(d, goLive + 9).mrrFijo.toString()).toBe("15000");
		expect(celda(d, goLive + 10).mrrFijo.isZero()).toBe(true);
	});

	it("sin duracion es permanente, no cero", () => {
		const d = deal({ mrrFijoClp: new Decimal("15000"), mrrFijoMeses: null });
		const p = proyectar(d);
		const ultimo = p.meses.at(-1);

		expect(ultimo?.mrrFijo.toString()).toBe("15000");
	});
});

describe("EVAL-F8 — escenarios acumulativos", () => {
	const abierto = (
		dealId: string,
		forecastCategory: DealForecast["scenario"]["forecastCategory"],
	): DealForecast => ({
		scenario: {
			dealId,
			estado: "ABIERTO",
			forecastCategory,
			closeMonth: monthIndexFromKey("2026-09"),
		},
		input: deal({ dealId, closeMonth: monthIndexFromKey("2026-09") }),
	});

	const deals: DealForecast[] = [
		won(deal({ dealId: "ganado" })),
		abierto("commit", "COMMIT"),
		abierto("best", "BEST_CASE"),
		abierto("pipeline", "PIPELINE"),
		abierto("sin-categoria", null),
		abierto("omitido", "OMITIR"),
	];

	it("cada escenario incluye a los anteriores", () => {
		const r = runAllScenarios({ deals, params: PARAMS });

		expect(r.get("LIVE")?.dealIds).toEqual(["ganado"]);
		expect(r.get("COMMIT")?.dealIds).toEqual(["ganado", "commit"]);
		expect(r.get("BEST_CASE")?.dealIds).toEqual(["ganado", "commit", "best"]);
		expect(r.get("QUALIFIED")?.dealIds).toEqual([
			"ganado",
			"commit",
			"best",
			"pipeline",
		]);
	});

	it("sin categoria no entra a ningun escenario, ni siquiera a Qualified", () => {
		// Un deal con fecha de cierre pero sin categoria es invisible para el
		// forecast. Es a proposito: un dato faltante no es una decision de
		// pipeline. El costo es que se puede perder plata en silencio, asi que
		// el CRM necesita una vista que los liste.
		expect(scenarioFloorOf(abierto("x", null).scenario)).toBeNull();
	});

	it("Omitir queda afuera de los cuatro", () => {
		const r = runAllScenarios({ deals, params: PARAMS });
		for (const resultado of r.values()) {
			expect(resultado.dealIds).not.toContain("omitido");
		}
	});

	it("regla anti doble conteo: un Won marcado Commit cuenta una sola vez, como Live", () => {
		const wonYCommit: DealForecast = {
			scenario: {
				dealId: "ambos",
				estado: "WON",
				forecastCategory: "COMMIT",
				closeMonth: monthIndexFromKey("2026-09"),
			},
			input: deal({ dealId: "ambos" }),
		};

		expect(scenarioFloorOf(wonYCommit.scenario)).toBe("LIVE");

		const r = runForecast({
			deals: [wonYCommit],
			params: PARAMS,
			scenario: "COMMIT",
		});
		expect(r.dealIds).toEqual(["ambos"]);
	});

	it("Lost, Stand By y sin Expected Close no proyectan", () => {
		const base = {
			dealId: "x",
			forecastCategory: "COMMIT" as const,
			closeMonth: monthIndexFromKey("2026-09"),
		};

		expect(scenarioFloorOf({ ...base, estado: "LOST" })).toBeNull();
		expect(scenarioFloorOf({ ...base, estado: "STAND_BY" })).toBeNull();
		expect(
			scenarioFloorOf({ ...base, estado: "ABIERTO", closeMonth: null }),
		).toBeNull();
	});
});

describe("rev share sobre el SPP consolidado", () => {
	// La regla que mas facil se implementa mal: el tramo se elige con la suma
	// de todos los deals del escenario, no deal por deal.
	const chico = (dealId: string) =>
		won(
			deal({
				dealId,
				saldoVistaMaxClp: new Decimal("200000000"),
				mesesDeRamp: 1,
				cuentasRegimen: null,
				minimoMensualClp: null,
				setupFeeClp: null,
			}),
		);

	it("dos deals por debajo del umbral pagan rev share al consolidarse", () => {
		const unoSolo = runForecast({
			deals: [chico("a")],
			params: PARAMS,
			scenario: "LIVE",
		});
		const dos = runForecast({
			deals: [chico("a"), chico("b")],
			params: PARAMS,
			scenario: "LIVE",
		});

		const mes = (r: typeof unoSolo) =>
			r.meses.find((m) => m.sppConsolidado.greaterThan(0));

		// 200 M solo no llega al umbral de 300 M; 400 M si.
		expect(mes(unoSolo)?.float.isZero()).toBe(true);
		expect(mes(dos)?.float.isZero()).toBe(false);
	});

	it("el float no es escalonado: la tasa del tramo aplica al total", () => {
		const r = runForecast({
			deals: [chico("a"), chico("b")],
			params: PARAMS,
			scenario: "LIVE",
		});
		const m = r.meses.find((x) => x.sppConsolidado.greaterThan(0));
		if (m === undefined) throw new Error("no hubo mes con saldo");

		// 400 M cae en el tramo 1, al 20% de la TPM, sobre el total.
		const esperado = m.sppConsolidado
			.times(PARAMS.tpmAnual.dividedBy(12))
			.times("0.20");
		expect(m.float.toString()).toBe(esperado.toString());
	});

	it("no se puede derivar un escenario restando otro: el float no es aditivo", () => {
		const live = runForecast({
			deals: [chico("a")],
			params: PARAMS,
			scenario: "LIVE",
		});
		const dosDeals = [
			chico("a"),
			{
				...chico("b"),
				scenario: {
					...chico("b").scenario,
					estado: "ABIERTO" as const,
					forecastCategory: "COMMIT" as const,
				},
			},
		];
		const commit = runForecast({
			deals: dosDeals,
			params: PARAMS,
			scenario: "COMMIT",
		});

		const floatLive = live.meses.reduce(
			(a, m) => a.plus(m.float),
			new Decimal(0),
		);
		const floatCommit = commit.meses.reduce(
			(a, m) => a.plus(m.float),
			new Decimal(0),
		);

		// Live aporta 0 (200 M < umbral) pero Commit aporta mucho mas que 0:
		// la diferencia no es "lo que agrega el deal nuevo".
		expect(floatLive.isZero()).toBe(true);
		expect(floatCommit.greaterThan(0)).toBe(true);
	});
});

describe("EVAL-F9 — determinismo y trazabilidad", () => {
	const deals = [won(deal({ dealId: "a" })), won(deal({ dealId: "b" }))];

	it("dos corridas con los mismos inputs dan el mismo resultado", () => {
		const a = runForecast({ deals, params: PARAMS, scenario: "QUALIFIED" });
		const b = runForecast({ deals, params: PARAMS, scenario: "QUALIFIED" });

		const serie = (r: typeof a) => r.meses.map((m) => m.total.toString());
		expect(serie(a)).toEqual(serie(b));
	});

	it("el resultado dice con que se produjo", () => {
		const r = runForecast({ deals, params: PARAMS, scenario: "LIVE" });

		expect(r.engineVersion).toBe(ENGINE_VERSION);
		expect(r.paramsChecksum).toMatch(/^[0-9a-f]{64}$/);
		expect(r.horizonteMeses).toBe(HORIZONTE);
		expect(r.meses).toHaveLength(HORIZONTE);
	});
});

describe("agregacion", () => {
	it("sin deals devuelve una serie vacia, no una llena de ceros", () => {
		expect(aggregate({ projections: [], params: PARAMS })).toEqual([]);
	});

	it("el total es setup mas recurrente mas float", () => {
		const r = runForecast({
			deals: [won(deal())],
			params: PARAMS,
			scenario: "LIVE",
		});

		for (const m of r.meses) {
			expect(m.total.toString()).toBe(
				m.setup.plus(m.recurrente).plus(m.float).toString(),
			);
		}
	});

	it("agrupa por linea de revenue", () => {
		const r = runForecast({
			deals: [
				won(deal({ dealId: "cv" })),
				won(
					deal({
						dealId: "infra",
						productos: [CORE_DE_CUENTAS],
						saldoVistaMaxClp: null,
					}),
				),
			],
			params: PARAMS,
			scenario: "LIVE",
		});

		const conDatos = r.meses.find((m) => m.total.greaterThan(0));
		expect(conDatos?.porLinea.has("CUENTAS_VIRTUALES")).toBe(true);
		expect(conDatos?.porLinea.has("INFRAESTRUCTURA")).toBe(true);
	});
});
