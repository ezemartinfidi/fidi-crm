import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { monthIndexFromKey, monthKeyOf, monthRange } from "../src/month";
import {
	cuotaSetup,
	goLiveMonth,
	mesDeRamp,
	recurrenteActivo,
} from "../src/timing";

const CLOSE = monthIndexFromKey("2026-09");

describe("el go-live sale del Expected Close", () => {
	it("cae el mes siguiente a la ultima cuota de setup", () => {
		// Close sep-26, 4 meses de setup: cuotas oct, nov, dic, ene. Go-live feb-27.
		expect(monthKeyOf(goLiveMonth(CLOSE, 4))).toBe("2027-02");
	});

	it("en Cuentas Virtuales, con el default de 2 meses, es close + 3", () => {
		expect(monthKeyOf(goLiveMonth(CLOSE, 2))).toBe("2026-12");
	});
});

describe("las cuotas de setup", () => {
	const setup = new Decimal("100000000");

	it("son iguales y arrancan el mes siguiente al close", () => {
		const cuota = (key: string) =>
			cuotaSetup({
				mes: monthIndexFromKey(key),
				close: CLOSE,
				setupFeeClp: setup,
				mesesDeSetup: 4,
			}).toString();

		expect(cuota("2026-09")).toBe("0"); // el mes del close no paga
		expect(cuota("2026-10")).toBe("25000000");
		expect(cuota("2027-01")).toBe("25000000");
		expect(cuota("2027-02")).toBe("0"); // ya es go-live
	});

	it("suman exactamente el fee", () => {
		const total = monthRange(CLOSE, 12).reduce(
			(acc, mes) =>
				acc.plus(
					cuotaSetup({
						mes,
						close: CLOSE,
						setupFeeClp: setup,
						mesesDeSetup: 4,
					}),
				),
			new Decimal(0),
		);
		expect(total.toString()).toBe(setup.toString());
	});

	it("sin fee no hay cuotas: en Cuentas Virtuales el setup es opcional", () => {
		expect(
			cuotaSetup({
				mes: monthIndexFromKey("2026-10"),
				close: CLOSE,
				setupFeeClp: null,
				mesesDeSetup: 2,
			}).toString(),
		).toBe("0");
	});
});

describe("EVAL-F7 — Fin Contrato", () => {
	const goLive = goLiveMonth(CLOSE, 2);
	const fin = monthIndexFromKey("2027-03");

	it("factura el recurrente hasta ese mes inclusive", () => {
		expect(
			recurrenteActivo({
				mes: monthIndexFromKey("2027-03"),
				goLive,
				finContrato: fin,
			}),
		).toBe(true);
	});

	it("y es cero desde el mes siguiente", () => {
		expect(
			recurrenteActivo({
				mes: monthIndexFromKey("2027-04"),
				goLive,
				finContrato: fin,
			}),
		).toBe(false);
	});

	it("no afecta a las cuotas de setup", () => {
		const cuota = cuotaSetup({
			mes: monthIndexFromKey("2026-10"),
			close: CLOSE,
			setupFeeClp: new Decimal("50000000"),
			mesesDeSetup: 2,
		});
		expect(cuota.greaterThan(0)).toBe(true);
	});

	it("sin fin de contrato el recurrente no se corta", () => {
		expect(
			recurrenteActivo({
				mes: monthIndexFromKey("2030-01"),
				goLive,
				finContrato: null,
			}),
		).toBe(true);
	});

	it("nunca factura antes del go-live", () => {
		expect(
			recurrenteActivo({
				mes: monthIndexFromKey("2026-10"),
				goLive,
				finContrato: null,
			}),
		).toBe(false);
	});
});

describe("el mes de ramp", () => {
	it("es 1 en el go-live y 0 antes", () => {
		const goLive = goLiveMonth(CLOSE, 2);
		expect(mesDeRamp(goLive, goLive)).toBe(1);
		expect(mesDeRamp(goLive - 1, goLive)).toBe(0);
		expect(mesDeRamp(goLive + 5, goLive)).toBe(6);
	});
});
