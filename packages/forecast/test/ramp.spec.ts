import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { rampParamsOf, V3_PARAMS } from "../src/params";
import { rampCompuesto, rampLineal } from "../src/ramp";

const SALDO = rampParamsOf(V3_PARAMS.rampCvSaldo);
const CUENTAS = rampParamsOf(V3_PARAMS.rampCvCuentas);
const TOPE = new Decimal("1000000000");

describe("ramp compuesto de Cuentas Virtuales", () => {
	it("los tres primeros meses son planos, al 5% del tope cada uno", () => {
		const esperado = TOPE.times("0.05").toString();
		for (const mes of [1, 2, 3]) {
			expect(rampCompuesto({ mes, tope: TOPE, params: SALDO }).toString()).toBe(
				esperado,
			);
		}
	});

	it("desde el mes 4 compone sobre el plano, no sobre el tope", () => {
		const plano = TOPE.times("0.05");
		expect(
			rampCompuesto({ mes: 4, tope: TOPE, params: SALDO }).toString(),
		).toBe(plano.times("1.145").toString());
		expect(
			rampCompuesto({ mes: 5, tope: TOPE, params: SALDO }).toString(),
		).toBe(plano.times(new Decimal("1.145").pow(2)).toString());
	});

	it("las cuentas componen mas rapido que el saldo", () => {
		const saldo = rampCompuesto({ mes: 8, tope: TOPE, params: SALDO });
		const cuentas = rampCompuesto({ mes: 8, tope: TOPE, params: CUENTAS });
		expect(cuentas.greaterThan(saldo)).toBe(true);
	});

	it("nunca pasa el tope, y una vez que lo toca se queda plano", () => {
		for (const mes of [20, 40, 100]) {
			expect(
				rampCompuesto({ mes, tope: TOPE, params: CUENTAS }).toString(),
			).toBe(TOPE.toString());
		}
	});

	it("antes del go-live no hay nada", () => {
		expect(
			rampCompuesto({ mes: 0, tope: TOPE, params: SALDO }).toString(),
		).toBe("0");
	});

	it("Meses de Ramp acota la duracion: desde ahi vale el tope", () => {
		expect(
			rampCompuesto({
				mes: 6,
				tope: TOPE,
				params: SALDO,
				mesesDeRamp: 6,
			}).toString(),
		).toBe(TOPE.toString());
		expect(
			rampCompuesto({
				mes: 5,
				tope: TOPE,
				params: SALDO,
				mesesDeRamp: 6,
			}).lessThan(TOPE),
		).toBe(true);
	});

	it("crece de forma monotona", () => {
		let previo = new Decimal(0);
		for (let mes = 1; mes <= 24; mes++) {
			const actual = rampCompuesto({ mes, tope: TOPE, params: CUENTAS });
			expect(actual.greaterThanOrEqualTo(previo)).toBe(true);
			previo = actual;
		}
	});
});

describe("ramp lineal de Infraestructura", () => {
	it("reparte el tope en partes iguales a lo largo de los meses de ramp", () => {
		expect(rampLineal({ mes: 3, tope: TOPE, mesesDeRamp: 10 }).toString()).toBe(
			TOPE.times(3).dividedBy(10).toString(),
		);
	});

	it("llega al tope en el ultimo mes y se queda", () => {
		expect(
			rampLineal({ mes: 10, tope: TOPE, mesesDeRamp: 10 }).toString(),
		).toBe(TOPE.toString());
		expect(
			rampLineal({ mes: 30, tope: TOPE, mesesDeRamp: 10 }).toString(),
		).toBe(TOPE.toString());
	});

	// Antes este test afirmaba que sin Meses de Ramp arrancaba en el tope, que
	// equivale a no tener ramp. Era un bug: el Excel v4 define una escalera por
	// defecto para Infra.
	it("sin meses de ramp aplica la escalera por defecto: 5/5/5 y despues +10pp", () => {
		const pct = (mes: number) =>
			rampLineal({ mes, tope: TOPE, mesesDeRamp: null })
				.dividedBy(TOPE)
				.toString();

		expect(pct(1)).toBe("0.05");
		expect(pct(2)).toBe("0.05");
		expect(pct(3)).toBe("0.05");
		expect(pct(4)).toBe("0.15");
		expect(pct(5)).toBe("0.25");
		expect(pct(12)).toBe("0.95");
	});

	it("sin meses de ramp llega al 100% en el mes 13 y no lo pasa", () => {
		// El Excel rotula la regla como "lineal 12m", pero 5/5/5 y +10pp llegan
		// al tope recien en el 13. Se implementa la regla, no el rotulo; si
		// EVAL-F1 difiere en un deal de Infra sin Meses de Ramp, empezar por aca.
		expect(
			rampLineal({ mes: 13, tope: TOPE, mesesDeRamp: null }).toString(),
		).toBe(TOPE.toString());
		expect(
			rampLineal({ mes: 40, tope: TOPE, mesesDeRamp: null }).toString(),
		).toBe(TOPE.toString());
	});
});

describe("EVAL-F4 — el porcentaje de cuentas activas", () => {
	it("aplicado al tope da exactamente el 70% del caso base", () => {
		// usarPctActivas arranca apagado (D9): se usa Cuentas Regimen directo.
		// Cuando se prende, el tope se multiplica por el porcentaje.
		expect(V3_PARAMS.usarPctActivas).toBe(false);
		expect(V3_PARAMS.pctActivasDefault.toString()).toBe("0.7");

		const base = rampCompuesto({ mes: 6, tope: TOPE, params: CUENTAS });
		const conPct = rampCompuesto({
			mes: 6,
			tope: TOPE.times(V3_PARAMS.pctActivasDefault),
			params: CUENTAS,
		});

		expect(conPct.toString()).toBe(base.times("0.7").toString());
	});
});
