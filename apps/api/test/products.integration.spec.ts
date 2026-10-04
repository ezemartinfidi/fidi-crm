import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { seedProducts } from "../../../packages/db/prisma/seed-fidi";
import { ProductsService } from "../src/products/products.service";

/**
 * Producto es multi-select en Notion, y el sistema de campos custom no puede
 * representarlo: FieldValue guarda un solo optionId por [fieldId, dealId]. Por
 * eso tiene relacion propia, y por eso setForDeal reemplaza el conjunto entero
 * en vez de aplicar un delta — un delta mal aplicado deja un deal facturando
 * por un producto que ya no vende.
 */

const suffix = process.env.TEST_RUN_ID ?? "products-spec";
const userId = `user-${suffix}`;
const domain = `products-${suffix}.test`;

const products = new ProductsService(db);

let dealId: string;
let cvId: string;
let coreId: string;
let fdeId: string;

beforeAll(async () => {
	// El catalogo es data de referencia, no de demo: el test lo siembra el mismo
	// para no depender de que alguien haya corrido db:seed:fidi contra crm_test.
	await seedProducts();

	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Products Spec",
			email: `${userId}@example.test`,
		},
		update: {},
	});
	const company = await db.company.upsert({
		where: { domain },
		create: { name: `Products ${suffix}`, domain, ownerId: userId },
		update: {},
		select: { id: true },
	});
	const deal = await db.deal.create({
		data: { name: `Deal ${suffix}`, companyId: company.id, ownerId: userId },
		select: { id: true },
	});
	dealId = deal.id;

	const catalog = await db.product.findMany({
		select: { id: true, key: true },
	});
	const byKey = new Map(catalog.map((p) => [p.key, p.id]));
	cvId = byKey.get("cuentas_virtuales") ?? "";
	coreId = byKey.get("core_de_cuentas") ?? "";
	fdeId = byKey.get("forward_deployed_engineers") ?? "";
});

afterAll(async () => {
	await db.dealProduct.deleteMany({ where: { dealId } });
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("el catalogo", () => {
	it("tiene los seis productos de Fidi, con su linea de revenue", async () => {
		const list = await products.list();
		const byKey = new Map(list.map((p) => [p.key, p]));

		expect(list.length).toBeGreaterThanOrEqual(6);
		expect(byKey.get("cuentas_virtuales")?.revenueLine).toBe(
			"CUENTAS_VIRTUALES",
		);
		expect(byKey.get("forward_deployed_engineers")?.revenueLine).toBe(
			"FORWARD_DEPLOYED_ENGINEERS",
		);
		// Todo lo que no es CV ni FDE cae en Infraestructura.
		expect(byKey.get("core_de_cuentas")?.revenueLine).toBe("INFRAESTRUCTURA");
		expect(byKey.get("baas")?.revenueLine).toBe("INFRAESTRUCTURA");
	});
});

describe("los productos de un deal", () => {
	it("acepta varios a la vez, que es el caso que motiva la relacion", async () => {
		const result = await products.setForDeal(dealId, [cvId, coreId]);
		expect(result.products.map((p) => p.key).sort()).toEqual([
			"core_de_cuentas",
			"cuentas_virtuales",
		]);
	});

	it("reemplaza el conjunto entero: lo que no esta en la lista se saca", async () => {
		await products.setForDeal(dealId, [fdeId]);
		const after = await products.forDeal(dealId);

		expect(after.map((p) => p.key)).toEqual(["forward_deployed_engineers"]);
	});

	it("es idempotente: escribir lo mismo dos veces no duplica", async () => {
		await products.setForDeal(dealId, [cvId, coreId]);
		await products.setForDeal(dealId, [cvId, coreId]);

		const rows = await db.dealProduct.count({ where: { dealId } });
		expect(rows).toBe(2);
	});

	it("ignora ids repetidos en la entrada", async () => {
		const result = await products.setForDeal(dealId, [cvId, cvId, cvId]);
		expect(result.products).toHaveLength(1);
	});

	it("con lista vacia deja el deal sin productos", async () => {
		await products.setForDeal(dealId, []);
		expect(await products.forDeal(dealId)).toEqual([]);
	});
});
