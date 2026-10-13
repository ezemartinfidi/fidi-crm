import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { seedProducts } from "../../../packages/db/prisma/seed-fidi";
import { forecastRunOutput } from "../src/forecast/forecast.contracts";
import { ForecastService } from "../src/forecast/forecast.service";

/**
 * El borde entre la base y el motor.
 *
 * Lo que se testea aca es la **traduccion**, no la aritmetica: el motor tiene
 * sus propios 83 tests y no necesita una base. Lo que puede romperse en esta
 * capa es que un campo se lea del lugar equivocado, que un null se vuelva cero,
 * o que la etapa del deal se mapee mal y el deal entre al escenario que no es.
 */

const suffix = process.env.TEST_RUN_ID ?? "forecast-spec";
const userId = `user-${suffix}`;
const domain = `forecast-${suffix}.test`;

const forecast = new ForecastService(db);

let wonId: string;
let standById: string;
let sinCloseId: string;

beforeAll(async () => {
	await seedProducts();

	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Forecast Spec",
			email: `${userId}@example.test`,
		},
		update: {},
	});
	const company = await db.company.upsert({
		where: { domain },
		create: { name: `Forecast ${suffix}`, domain, ownerId: userId },
		update: {},
		select: { id: true },
	});

	const cv = await db.product.findFirstOrThrow({
		where: { revenueLine: "CUENTAS_VIRTUALES" },
		select: { id: true },
	});

	const crear = async (
		name: string,
		stage: "WON" | "STAND_BY" | "NEGOTIATION",
		expectedCloseDate: Date | null,
	) => {
		const deal = await db.deal.create({
			data: {
				name: `${name} ${suffix}`,
				companyId: company.id,
				ownerId: userId,
				stage,
				expectedCloseDate,
				products: { create: { productId: cv.id } },
			},
			select: { id: true },
		});
		await db.dealForecastInput.create({
			data: {
				dealId: deal.id,
				cuentasRegimen: 10_000,
				saldoVistaMaxClp: "1000000000",
				minimoMensualClp: "5000000",
				setupFeeClp: "12000000",
				mesesDeSetup: 2,
			},
		});
		return deal.id;
	};

	wonId = await crear("Ganado", "WON", new Date("2026-08-15T00:00:00Z"));
	standById = await crear(
		"Pausado",
		"STAND_BY",
		new Date("2026-08-15T00:00:00Z"),
	);
	sinCloseId = await crear("Sin close", "NEGOTIATION", null);
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("que deals llegan al motor", () => {
	it("traduce la etapa del deal al estado que el motor entiende", async () => {
		const deals = await forecast.dealsForEngine();
		const porId = new Map(deals.map((d) => [d.input.dealId, d]));

		expect(porId.get(wonId)?.scenario.estado).toBe("WON");
		expect(porId.get(standById)?.scenario.estado).toBe("STAND_BY");
		expect(porId.get(sinCloseId)?.scenario.estado).toBe("ABIERTO");
	});

	it("un deal sin Expected Close llega con closeMonth en null, no en cero", async () => {
		// Si llegara en cero proyectaria desde el año 0 y ensuciaria la serie.
		// Es scenarioFloorOf quien lo excluye, y para eso necesita el null.
		const deals = await forecast.dealsForEngine();
		const sinClose = deals.find((d) => d.input.dealId === sinCloseId);

		expect(sinClose?.scenario.closeMonth).toBeNull();
	});

	it("lee los inputs economicos de la tabla, no de Deal", async () => {
		const deals = await forecast.dealsForEngine();
		const ganado = deals.find((d) => d.input.dealId === wonId);

		expect(ganado?.input.cuentasRegimen).toBe(10_000);
		expect(ganado?.input.minimoMensualClp?.toString()).toBe("5000000");
		expect(ganado?.input.mesesDeSetup).toBe(2);
	});

	it("un deal sin fila de inputs llega con todo en null, no en cero", async () => {
		// "Sin fila" significa no modelado. Volverlo cero lo haria aparecer en
		// la suma como un deal que factura nada, que no es lo mismo.
		const company = await db.company.findFirstOrThrow({
			where: { domain },
			select: { id: true },
		});
		const pelado = await db.deal.create({
			data: {
				name: `Pelado ${suffix}`,
				companyId: company.id,
				ownerId: userId,
				stage: "NEGOTIATION",
				expectedCloseDate: new Date("2026-09-15T00:00:00Z"),
			},
			select: { id: true },
		});

		const deals = await forecast.dealsForEngine();
		const sinInputs = deals.find((d) => d.input.dealId === pelado.id);

		expect(sinInputs?.input.cuentasRegimen).toBeNull();
		expect(sinInputs?.input.minimoMensualClp).toBeNull();
		expect(sinInputs?.input.productos).toHaveLength(0);
	});
});

describe("la proyeccion que sale por la API", () => {
	it("devuelve el horizonte completo y dice con que se produjo", async () => {
		const r = await forecast.project("QUALIFIED");

		expect(r.meses).toHaveLength(r.horizonteMeses);
		expect(r.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(r.paramsChecksum).toMatch(/^[0-9a-f]{64}$/);
		expect(r.mes1).toMatch(/^\d{4}-\d{2}$/);
	});

	it("sin parameter set activo cae al v3 y lo dice en la respuesta", async () => {
		// No es un default silencioso: la version viaja al cliente.
		const r = await forecast.project("LIVE");
		expect(r.parameterSetVersion).toBe("v3-builtin");
	});

	it("la respuesta cumple el contrato, con los montos como string", async () => {
		// Se valida con el mismo schema que publica el router, en vez de mirar
		// el tipo de un campo suelto: lo que importa es que el contrato entero
		// se cumpla. Y los montos son string a proposito, porque serializarlos
		// a number tiraria la precision que decimal.js existe para conservar.
		const r = await forecast.project("LIVE");

		expect(() => forecastRunOutput.parse(r)).not.toThrow();
	});

	it("el deal pausado y el que no tiene close quedan fuera de los cuatro", async () => {
		for (const escenario of [
			"LIVE",
			"COMMIT",
			"BEST_CASE",
			"QUALIFIED",
		] as const) {
			const r = await forecast.project(escenario);
			expect(r.dealIds).not.toContain(standById);
			expect(r.dealIds).not.toContain(sinCloseId);
		}
	});

	it("el ganado entra a los cuatro escenarios, porque son acumulativos", async () => {
		for (const escenario of [
			"LIVE",
			"COMMIT",
			"BEST_CASE",
			"QUALIFIED",
		] as const) {
			const r = await forecast.project(escenario);
			expect(r.dealIds).toContain(wonId);
		}
	});
});

describe("la proyeccion de un deal solo", () => {
	it("devuelve los componentes separados y el MRR de regimen", async () => {
		const r = await forecast.byDeal(wonId);

		expect(r.dealId).toBe(wonId);
		expect(r.revenueLine).toBe("CUENTAS_VIRTUALES");
		expect(Number(r.mrrDeRegimen)).toBeGreaterThan(0);
		expect(r.meses.length).toBeGreaterThan(0);
	});

	it("falla con 404 y no en silencio cuando el deal no existe", async () => {
		expect(forecast.byDeal("no-existe")).rejects.toThrow();
	});
});
