import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { rampParamsOf, V3_PARAMS } from "../src/params";
import { factorDeRamp, rampCompuesto, rampLineal } from "../src/ramp";

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

	// Antes habia aca una escalera 5/10/15 y despues +10pp, despejada del Excel
	// v4. Reproducia esa planilla exacto, pero describia el modelo de agosto: la
	// metodologia del 7-oct dice que sin Meses de Ramp el deal entra directo al
	// tope. Queda la arqueologia en docs/forecast-model.md.
	it("sin meses de ramp entra directo al tope en el go-live", () => {
		expect(
			rampLineal({ mes: 1, tope: TOPE, mesesDeRamp: null }).toString(),
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

describe("el factor del ramp de CV se deriva de Meses de Ramp", () => {
	// El ejemplo verificable de la metodologia del 7-oct-2026: tope 7.000 MM,
	// ramp 8, 1 mes plano. El factor da 1,534 y la curva es la de la tabla.
	const TOPE_EJEMPLO = new Decimal("7000");
	const PARAMS_EJEMPLO = {
		arranquePct: new Decimal("0.05"),
		mesesPlanos: 1,
		// Nunca se usa: con mesesDeRamp cargado el factor se deriva.
		factor: new Decimal("999"),
	};

	const pct = (mes: number) =>
		rampCompuesto({
			mes,
			tope: TOPE_EJEMPLO,
			params: PARAMS_EJEMPLO,
			mesesDeRamp: 8,
		})
			.dividedBy(TOPE_EJEMPLO)
			.times(100)
			.toDecimalPlaces(1)
			.toNumber();

	it("reproduce la curva del ejemplo de la metodologia", () => {
		expect([1, 2, 3, 4].map(pct)).toEqual([5.0, 7.7, 11.8, 18.1]);
		expect([5, 6, 7, 8].map(pct)).toEqual([27.7, 42.5, 65.2, 100]);
	});

	it("el factor sale de la duracion, no de una constante", () => {
		// (1/0,05)^(1/(8-1)) = 20^(1/7)
		const esperado = new Decimal(20).pow(new Decimal(1).dividedBy(7));
		expect(
			factorDeRamp(PARAMS_EJEMPLO, 8).minus(esperado).abs().lessThan("1e-12"),
		).toBe(true);
	});

	it("un ramp mas largo arranca igual pero sube mas despacio", () => {
		// Es la consecuencia de derivar el factor: los dos tocan el 100% en su
		// propio mes final, y el de 8 va siempre por delante.
		const corto = rampCompuesto({
			mes: 4,
			tope: TOPE_EJEMPLO,
			params: PARAMS_EJEMPLO,
			mesesDeRamp: 8,
		});
		const largo = rampCompuesto({
			mes: 4,
			tope: TOPE_EJEMPLO,
			params: PARAMS_EJEMPLO,
			mesesDeRamp: 16,
		});

		expect(corto.greaterThan(largo)).toBe(true);
		expect(
			rampCompuesto({
				mes: 16,
				tope: TOPE_EJEMPLO,
				params: PARAMS_EJEMPLO,
				mesesDeRamp: 16,
			}).toString(),
		).toBe(TOPE_EJEMPLO.toString());
	});
});
