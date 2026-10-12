import "@crm/env/load";

import path from "node:path";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: path.join("prisma", "schema.prisma"),
	migrations: {
		path: path.join("prisma", "migrations"),
		seed: "bun run prisma/seed.ts",
	},
	datasource: {
		url: env("DATABASE_URL"),
		// Solo la necesitan `migrate dev` y diffear el directorio de
		// migraciones, asi que es opcional: con `env()` seria obligatoria y
		// rompria `db:generate` y el build para todos los que no la tengan.
		//
		// Prisma la borra y la reconstruye en cada corrida. Nunca apuntarla a
		// una base con datos.
		...(process.env.SHADOW_DATABASE_URL
			? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
			: {}),
	},
});
