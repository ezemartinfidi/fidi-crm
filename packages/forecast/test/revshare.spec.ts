import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { revShareTramosOf, V3_PARAMS } from "../src/params";
import { pctTpmFor, revShareMensual } from "../src/revshare";

const TRAMOS = revShareTramosOf(V3_PARAMS);
const TPM = V3_PARAMS.tpmAnual;
const UMBRAL = V3_PARAMS.revShareUmbralMinimoClp;

function share(spp: string) {
	return revShareMensual({
		spp: new Decimal(spp),
		tramos: TRAMOS,
		tpmAnual: TPM,
		umbralMinimoClp: UMBRAL,
	});
}

describe("revenue share sobre float", () => {
	it("no paga nada por debajo del umbral de 300 M", () => {
		expect(share("299999999").toString()).toBe("0");
	});

	it("arranca justo en el umbral, al 20% de la TPM", () => {
		const esperado = new Decimal("300000000")
			.times(new Decimal("0.045").dividedBy(12))
			.times("0.20");
		expect(share("300000000").toString()).toBe(esperado.toString());
	});

	it("no es escalonado: la tasa del tramo aplica al total", () => {
		const escalonado = new Decimal("2000000000")
			.times(new Decimal("0.045").dividedBy(12))
			.times("0.20")
			.plus(
				new Decimal("1000000000")
					.times(new Decimal("0.045").dividedBy(12))
					.times("0.25"),
			);
		expect(share("3000000000").toString()).not.toBe(escalonado.toString());

		const plano = new Decimal("3000000000")
			.times(new Decimal("0.045").dividedBy(12))
			.times("0.25");
		expect(share("3000000000").toString()).toBe(plano.toString());
	});

	it("recorre los cinco tramos", () => {
		expect(pctTpmFor(TRAMOS, new Decimal("500000000")).toString()).toBe("0.2");
		expect(pctTpmFor(TRAMOS, new Decimal("3000000000")).toString()).toBe(
			"0.25",
		);
		expect(pctTpmFor(TRAMOS, new Decimal("10000000000")).toString()).toBe(
			"0.3",
		);
		expect(pctTpmFor(TRAMOS, new Decimal("30000000000")).toString()).toBe(
			"0.35",
		);
	});

	it("no hay cliff arriba de 40.000 M: se mantiene el ultimo tramo al 35%", () => {
		// La version de julio ponia 0% aca. Fue corregido el 12-ago-26.
		expect(pctTpmFor(TRAMOS, new Decimal("40000000000")).toString()).toBe(
			"0.35",
		);
		expect(pctTpmFor(TRAMOS, new Decimal("100000000000")).toString()).toBe(
			"0.35",
		);
		expect(share("100000000000").greaterThan(0)).toBe(true);
	});

	it("crece de forma monotona: mas saldo nunca paga menos", () => {
		const saldos = [
			"300000000",
			"2000000000",
			"5000000000",
			"20000000000",
			"40000000000",
			"80000000000",
		];
		let previo = new Decimal(0);
		for (const saldo of saldos) {
			const actual = share(saldo);
			expect(actual.greaterThanOrEqualTo(previo)).toBe(true);
			previo = actual;
		}
	});
});
