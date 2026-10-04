import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { tarifaTramosOf, V3_PARAMS } from "../src/params";
import { rateEfectivo, rateForCuentas, revenuePorCuenta } from "../src/tarifa";

const TRAMOS = tarifaTramosOf(V3_PARAMS);

describe("tarifa por volumen", () => {
	it("aplica el rate de la banda a todas las cuentas, no solo a las del tramo", () => {
		// 10.000 cae en la banda <=10.000, cuyo rate es 119. Las 10.000 pagan 119.
		expect(rateForCuentas(TRAMOS, 10_000).toString()).toBe("119");
		expect(revenuePorCuenta(TRAMOS, 10_000, "volumen").toString()).toBe(
			"1190000",
		);
	});

	it("cubre los bordes de cada tramo", () => {
		expect(rateForCuentas(TRAMOS, 1).toString()).toBe("760");
		expect(rateForCuentas(TRAMOS, 500).toString()).toBe("760");
		expect(rateForCuentas(TRAMOS, 501).toString()).toBe("618");
		expect(rateForCuentas(TRAMOS, 250_000).toString()).toBe("61");
		expect(rateForCuentas(TRAMOS, 250_001).toString()).toBe("46");
	});

	it("el ultimo tramo no tiene techo", () => {
		expect(rateForCuentas(TRAMOS, 5_000_000).toString()).toBe("46");
	});

	it("sin cuentas no hay revenue", () => {
		expect(revenuePorCuenta(TRAMOS, 0, "volumen").toString()).toBe("0");
	});
});

describe("EVAL-F5 — volumen contra marginal", () => {
	it("para 10.000 cuentas, volumen da 119 plano y marginal da un promedio mayor", () => {
		const volumen = rateEfectivo(TRAMOS, 10_000, "volumen");
		const marginal = rateEfectivo(TRAMOS, 10_000, "marginal");

		expect(volumen.toString()).toBe("119");
		expect(marginal.greaterThan(volumen)).toBe(true);
	});

	it("marginal es siempre mayor o igual, porque las primeras cuentas pagan los rates caros", () => {
		for (const cuentas of [1, 500, 1_000, 2_500, 10_000, 50_000, 300_000]) {
			const volumen = revenuePorCuenta(TRAMOS, cuentas, "volumen");
			const marginal = revenuePorCuenta(TRAMOS, cuentas, "marginal");
			expect(marginal.greaterThanOrEqualTo(volumen)).toBe(true);
		}
	});

	it("dentro del primer tramo los dos metodos coinciden", () => {
		expect(revenuePorCuenta(TRAMOS, 400, "volumen").toString()).toBe(
			revenuePorCuenta(TRAMOS, 400, "marginal").toString(),
		);
	});

	it("marginal suma tramo por tramo", () => {
		// 501 cuentas: las primeras 500 a 760, la 501 a 618.
		const esperado = new Decimal(760).times(500).plus(618);
		expect(revenuePorCuenta(TRAMOS, 501, "marginal").toString()).toBe(
			esperado.toString(),
		);
	});
});
