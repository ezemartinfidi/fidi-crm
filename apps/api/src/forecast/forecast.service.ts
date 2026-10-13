import type { Db } from "@crm/db";
import {
	type DealForecast,
	type ForecastParams,
	forecastParamsSchema,
	monthIndexOf,
	monthKeyOf,
	mrrDeRegimen,
	type ProductoComponentes,
	projectDeal,
	type RevenueLine,
	runForecast,
	type Scenario,
	V3_PARAMS,
} from "@crm/forecast";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

/**
 * El borde entre la base y el motor.
 *
 * El motor es puro y no conoce Prisma, asi que traducir vive aca. La
 * separacion no es ceremonia: es lo que permite reproducir un forecast viejo
 * armando la entrada a mano, y testear el modelo sin levantar una base.
 *
 * Aca tampoco se calcula nada. Si aparece una regla de negocio en este archivo,
 * esta en el lugar equivocado.
 */
@Injectable()
export class ForecastService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * El parameter set activo, o el v3 congelado si todavia no hay ninguno.
	 *
	 * El fallback existe para que la pantalla de forecast funcione desde el
	 * primer dia, antes de que alguien cargue parametros en la base. No es un
	 * default silencioso: la version se devuelve en la respuesta.
	 */
	async activeParams(
		version?: string,
	): Promise<{ params: ForecastParams; version: string }> {
		const row = await this.db.forecastParameterSet.findFirst({
			where: version === undefined ? { status: "ACTIVE" } : { version },
			select: { version: true, payload: true },
		});

		if (row === null) {
			if (version !== undefined) {
				throw new NotFoundException(`No existe el parameter set "${version}".`);
			}
			return { params: V3_PARAMS, version: "v3-builtin" };
		}

		return {
			params: forecastParamsSchema.parse(row.payload),
			version: row.version,
		};
	}

	/**
	 * Los deals que el motor puede proyectar.
	 *
	 * Se traen todos los no archivados y es `scenarioFloorOf` quien decide cual
	 * entra a cada escenario. Filtrar aca por etapa o categoria duplicaria esa
	 * regla en dos lugares, y las dos copias se desincronizan.
	 */
	async dealsForEngine(): Promise<DealForecast[]> {
		const deals = await this.db.deal.findMany({
			where: { archivedAt: null },
			select: {
				id: true,
				stage: true,
				expectedCloseDate: true,
				products: { select: { product: { select: { revenueLine: true } } } },
				forecastInput: true,
			},
		});

		return deals.map((deal) => {
			const input = deal.forecastInput;
			const closeMonth =
				deal.expectedCloseDate === null
					? null
					: monthIndexOf(deal.expectedCloseDate);

			return {
				scenario: {
					dealId: deal.id,
					estado: estadoDeEtapa(deal.stage),
					forecastCategory: input?.forecastCategory ?? null,
					closeMonth,
				},
				input: {
					dealId: deal.id,
					closeMonth: closeMonth ?? 0,
					productos: deal.products.map((p) =>
						componentesDeLinea(p.product.revenueLine),
					),
					cuentasRegimen: input?.cuentasRegimen ?? null,
					saldoVistaMaxClp: input?.saldoVistaMaxClp ?? null,
					mesesDeRamp: input?.mesesDeRamp ?? null,
					mesesPlanosRamp: input?.mesesPlanosRamp ?? null,
					minimoMensualClp: input?.minimoMensualClp ?? null,
					setupFeeClp: input?.setupFeeClp ?? null,
					mesesDeSetup: input?.mesesDeSetup ?? null,
					mrrFijoClp: input?.mrrFijoClp ?? null,
					mrrFijoMeses: input?.mrrFijoMeses ?? null,
					finContratoMonth:
						input?.finContrato == null ? null : monthIndexOf(input.finContrato),
					recurringRule: input?.recurringRule ?? null,
				},
			};
		});
	}

	async project(scenario: Scenario, parameterSetVersion?: string) {
		const { params, version } = await this.activeParams(parameterSetVersion);
		const deals = await this.dealsForEngine();
		const resultado = runForecast({ deals, params, scenario });

		return {
			scenario: resultado.scenario,
			mes1: monthKeyOf(resultado.mes1),
			horizonteMeses: resultado.horizonteMeses,
			engineVersion: resultado.engineVersion,
			paramsChecksum: resultado.paramsChecksum,
			parameterSetVersion: version,
			dealIds: [...resultado.dealIds],
			meses: resultado.meses.map((mes) => ({
				monthIndex: mes.mes,
				monthKey: monthKeyOf(mes.mes),
				setup: mes.setup.toString(),
				recurrente: mes.recurrente.toString(),
				float: mes.float.toString(),
				total: mes.total.toString(),
				sppConsolidado: mes.sppConsolidado.toString(),
				cuentas: mes.cuentas.toString(),
				porLinea: [...mes.porLinea.entries()].map(([revenueLine, total]) => ({
					revenueLine,
					total: total.toString(),
				})),
			})),
		};
	}

	/** Los cuatro escenarios, que es como se lee la pantalla. */
	async projectAll(parameterSetVersion?: string) {
		const escenarios: readonly Scenario[] = [
			"LIVE",
			"COMMIT",
			"BEST_CASE",
			"QUALIFIED",
		];
		const salida = [];
		for (const escenario of escenarios) {
			salida.push(await this.project(escenario, parameterSetVersion));
		}
		return salida;
	}

	async byDeal(dealId: string, parameterSetVersion?: string) {
		const { params } = await this.activeParams(parameterSetVersion);
		const deals = await this.dealsForEngine();
		const deal = deals.find((d) => d.input.dealId === dealId);
		if (deal === undefined) {
			throw new NotFoundException(`No existe el deal "${dealId}".`);
		}

		const proyeccion = projectDeal({
			input: deal.input,
			params,
			mes1: monthIndexOf(new Date(`${params.mes1}-01T00:00:00Z`)),
			horizonteMeses: params.horizonteMeses,
		});

		return {
			dealId: proyeccion.dealId,
			revenueLine: proyeccion.revenueLine,
			mrrDeRegimen: mrrDeRegimen(proyeccion).toString(),
			meses: proyeccion.meses.map((mes) => ({
				monthIndex: mes.mes,
				monthKey: monthKeyOf(mes.mes),
				setup: mes.setup.toString(),
				recurrente: mes.recurrente.toString(),
				minimo: mes.minimo.toString(),
				porCuenta: mes.porCuenta.toString(),
				mrrFijo: mes.mrrFijo.toString(),
				saldoFloat: mes.saldoFloat.toString(),
				cuentas: mes.cuentas.toString(),
			})),
		};
	}
}

/**
 * La etapa del deal, traducida al estado que mira el motor.
 *
 * STAND_BY es su propio estado y no "abierto": un deal pausado no proyecta,
 * pero tampoco esta perdido.
 */
function estadoDeEtapa(
	stage:
		| "LEAD"
		| "QUALIFIED"
		| "DISCOVERY"
		| "PROPOSAL"
		| "NEGOTIATION"
		| "WON"
		| "LOST"
		| "STAND_BY",
) {
	if (stage === "WON") return "WON" as const;
	if (stage === "LOST") return "LOST" as const;
	if (stage === "STAND_BY") return "STAND_BY" as const;
	return "ABIERTO" as const;
}

/**
 * Los componentes que cobra un producto, derivados de su linea de revenue.
 *
 * Es la matriz producto x componente de docs/forecast-model.md. Cuando se
 * carguen `ForecastProductRule` por parameter set, esta funcion pasa a ser el
 * default y la fila de la base gana.
 */
function componentesDeLinea(linea: RevenueLine): ProductoComponentes {
	if (linea === "CUENTAS_VIRTUALES") {
		return {
			revenueLine: linea,
			porCuenta: true,
			float: true,
			modo: "PISO",
		};
	}
	if (linea === "FORWARD_DEPLOYED_ENGINEERS") {
		return {
			revenueLine: linea,
			porCuenta: false,
			float: false,
			modo: "ADITIVO",
		};
	}
	return {
		revenueLine: linea,
		porCuenta: true,
		float: false,
		modo: "ADITIVO",
	};
}
