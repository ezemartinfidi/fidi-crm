import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

/**
 * El catalogo de productos de Fidi y su vinculo con los deals.
 *
 * En Notion, Producto es un multi-select. Aca es una relacion propia y no un
 * campo custom porque FieldValue guarda un solo optionId por [fieldId, dealId],
 * y porque el motor de forecast necesita la linea de revenue de cada producto
 * tipada, no una etiqueta de texto.
 */
@Injectable()
export class ProductsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list() {
		return this.db.product.findMany({
			where: { archivedAt: null },
			orderBy: { position: "asc" },
			select: {
				id: true,
				key: true,
				name: true,
				revenueLine: true,
				position: true,
			},
		});
	}

	async forDeal(dealId: string) {
		const rows = await this.db.dealProduct.findMany({
			where: { dealId },
			select: {
				product: {
					select: {
						id: true,
						key: true,
						name: true,
						revenueLine: true,
						position: true,
					},
				},
			},
			orderBy: { product: { position: "asc" } },
		});
		return rows.map((row) => row.product);
	}

	/** Reemplaza el conjunto entero en una transaccion, para que no quede a medias. */
	async setForDeal(dealId: string, productIds: readonly string[]) {
		const unique = [...new Set(productIds)];

		await this.db.$transaction([
			this.db.dealProduct.deleteMany({
				where: { dealId, productId: { notIn: unique } },
			}),
			...unique.map((productId) =>
				this.db.dealProduct.upsert({
					where: { dealId_productId: { dealId, productId } },
					create: { dealId, productId },
					update: {},
				}),
			),
		]);

		return { dealId, products: await this.forDeal(dealId) };
	}
}
