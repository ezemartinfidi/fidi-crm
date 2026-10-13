import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	dealProductsInput,
	dealProductsOutput,
	productListOutput,
} from "./products.contracts";
import { ProductsService } from "./products.service";

@Router({ alias: "products" })
@UseMiddlewares(AuthMiddleware)
export class ProductsRouter {
	constructor(
		@Inject(ProductsService) private readonly products: ProductsService,
	) {}

	@Query({
		output: productListOutput,
		meta: restMeta("GET", "/products", ["Products"]),
	})
	async list() {
		return this.products.list();
	}

	@Mutation({
		input: dealProductsInput,
		output: dealProductsOutput,
		meta: restMeta("PUT", "/deals/{dealId}/products", ["Products"]),
	})
	async setForDeal(@Input() input: z.infer<typeof dealProductsInput>) {
		return this.products.setForDeal(input.dealId, input.productIds);
	}
}
