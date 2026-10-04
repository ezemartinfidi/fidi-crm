import { z } from "zod";

export const productOutput = z.object({
	id: z.string(),
	key: z.string(),
	name: z.string(),
	revenueLine: z.enum([
		"CUENTAS_VIRTUALES",
		"FORWARD_DEPLOYED_ENGINEERS",
		"INFRAESTRUCTURA",
	]),
	position: z.number(),
});

export const productListOutput = z.array(productOutput);

export const dealProductsInput = z.object({
	dealId: z.string(),
	/** El conjunto completo, no un delta: lo que no esta en la lista se saca. */
	productIds: z.array(z.string()),
});

export const dealProductsOutput = z.object({
	dealId: z.string(),
	products: productListOutput,
});
