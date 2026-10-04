import { describe, expect, it } from "bun:test";
import { ENGINE_VERSION } from "../src/index";
import {
	forecastParamsSchema,
	paramsChecksum,
	parseParams,
	V3_PARAMS,
	V3_PARAMS_INPUT,
} from "../src/params";

describe("los parametros v3", () => {
	it("son los del bloque JSON del 12-ago, no los de julio", () => {
		expect(V3_PARAMS.tpmAnual.toString()).toBe("0.045"); // era 4,75%
		expect(V3_PARAMS.mesesDeSetupDefaultCv).toBe(2); // la pagina de julio decia 3
		expect(V3_PARAMS.costoPctRevenueVariable.toString()).toBe("0.3");
	});

	it("resuelven la contradiccion del margen de CV a favor del 70% (D12)", () => {
		expect(V3_PARAMS.margenesBrutos.cvFee.toString()).toBe("0.7");
		expect(
			V3_PARAMS.costoPctRevenueVariable
				.plus(V3_PARAMS.margenesBrutos.cvFee)
				.toString(),
		).toBe("1");
	});

	it("cubren los tramos de tarifa de 1 a infinito, sin huecos ni solapes", () => {
		const tramos = V3_PARAMS.tarifaTramos;
		expect(tramos[0]?.desde).toBe(1);
		expect(tramos.at(-1)?.hasta).toBeNull();

		for (let i = 1; i < tramos.length; i++) {
			const previo = tramos[i - 1];
			const actual = tramos[i];
			if (!previo || !actual || previo.hasta === null) continue;
			expect(actual.desde).toBe(previo.hasta + 1);
		}
	});

	it("rechazan una moneda que no sea CLP", () => {
		// Contra el schema directo, que es el borde donde el valor es desconocido.
		expect(() =>
			forecastParamsSchema.parse({ ...V3_PARAMS_INPUT, moneda: "USD" }),
		).toThrow();
	});
});

describe("el checksum", () => {
	it("es estable: el mismo modelo da el mismo hash", () => {
		expect(paramsChecksum(V3_PARAMS)).toBe(paramsChecksum(V3_PARAMS));
	});

	it("describe el modelo, no como se escribio el JSON", () => {
		// Mismo valor, distinta representacion: numero en vez de string, y las
		// claves en otro orden. Parsea al mismo modelo, asi que el hash no cambia.
		const otroOrden = Object.fromEntries(
			Object.entries({ ...V3_PARAMS_INPUT, tpmAnual: 0.045 }).reverse(),
		);
		expect(paramsChecksum(parseParams(otroOrden))).toBe(
			paramsChecksum(V3_PARAMS),
		);
	});

	it("cambia si cambia un parametro, que es de lo que sirve", () => {
		const tocado = parseParams({ ...V3_PARAMS_INPUT, tpmAnual: "0.0475" });
		expect(paramsChecksum(tocado)).not.toBe(paramsChecksum(V3_PARAMS));
	});

	it("distingue un cambio adentro de un tramo", () => {
		const tramos = V3_PARAMS_INPUT.tarifaTramos.map((t, i) =>
			i === 0 ? { ...t, rateClp: "761" } : t,
		);
		const tocado = parseParams({ ...V3_PARAMS_INPUT, tarifaTramos: tramos });
		expect(paramsChecksum(tocado)).not.toBe(paramsChecksum(V3_PARAMS));
	});
});

describe("la version del motor", () => {
	it("esta declarada, porque un ForecastRun la guarda", () => {
		expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
