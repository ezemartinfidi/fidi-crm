import { Inject } from "@nestjs/common";
import { Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	dealForecastInput,
	dealForecastOutput,
	forecastRunOutput,
	projectAllOutput,
	projectInput,
} from "./forecast.contracts";
import { ForecastService } from "./forecast.service";

/**
 * El forecast por tRPC.
 *
 * `docs/api.md` dice que la inteligencia no vive en la API, y esto no la
 * viola: el forecast es aritmetica determinista, no criterio. El motor es un
 * paquete puro y este router solo lo invoca.
 *
 * Todo es Query y no Mutation: proyectar no escribe nada. Congelar un snapshot
 * si escribe, y por eso va a ser una mutation aparte.
 */
@Router({ alias: "forecast" })
@UseMiddlewares(AuthMiddleware)
export class ForecastRouter {
	constructor(
		@Inject(ForecastService) private readonly forecast: ForecastService,
	) {}

	@Query({
		input: projectInput,
		output: forecastRunOutput,
		meta: restMeta("GET", "/forecast/project", ["Forecast"]),
	})
	async project(@Input() input: z.infer<typeof projectInput>) {
		return this.forecast.project(
			input.scenario ?? "QUALIFIED",
			input.parameterSetVersion,
		);
	}

	@Query({
		input: projectInput,
		output: projectAllOutput,
		meta: restMeta("GET", "/forecast/scenarios", ["Forecast"]),
	})
	async scenarios(@Input() input: z.infer<typeof projectInput>) {
		return this.forecast.projectAll(input.parameterSetVersion);
	}

	@Query({
		input: dealForecastInput,
		output: dealForecastOutput,
		meta: restMeta("GET", "/deals/{dealId}/forecast", ["Forecast"]),
	})
	async byDeal(@Input() input: z.infer<typeof dealForecastInput>) {
		return this.forecast.byDeal(input.dealId);
	}
}
