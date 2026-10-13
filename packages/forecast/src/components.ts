import Decimal from "decimal.js";
import type { DealForecastInput, ProductoComponentes } from "./deal-input";
import type { ForecastParams } from "./params";
import { rampParamsOf, tarifaTramosOf } from "./params";
import { rampCompuesto, rampLineal } from "./ramp";
import { revenuePorCuenta } from "./tarifa";
import { cuotaSetup, goLiveMonth, mesDeRamp, recurrenteActivo } from "./timing";
import type { MonthIndex, RecurringRule, RevenueLine } from "./types";

/**
 * Los componentes de revenue de un deal en un mes.
 *
 * El float queda afuera a proposito. El rev share se calcula sobre el Saldo
 * Promedio Ponderado **consolidado de todos los deals del escenario**, asi que
 * ningun deal puede saber cuanto float le toca mirandose a si mismo. Lo que si
 * aporta es su saldo, y `aggregate.ts` lo suma y recien ahi elige el tramo.
 */
export type ComponentesMes = {
	readonly mes: MonthIndex;
	readonly setup: Decimal;
	readonly mrrFijo: Decimal;
	readonly minimo: Decimal;
	readonly porCuenta: Decimal;
	/** El recurrente ya combinado segun el modo: aditivo o piso. */
	readonly recurrente: Decimal;
	/** El saldo que este deal aporta al SPP consolidado. */
	readonly saldoFloat: Decimal;
	/** Cuentas activas del mes, despues del ramp. Para reportar y para costos. */
	readonly cuentas: Decimal;
};

const CERO = new Decimal(0);

/**
 * La linea de revenue del deal: la del primer producto que la define.
 *
 * Un deal con productos de lineas distintas existe (un BaaS que ademas lleva
 * Cuentas Virtuales), y la linea sirve para agrupar el reporte, no para
 * calcular. El calculo mira las banderas de cada producto, no esta etiqueta.
 */
export function revenueLineOf(input: DealForecastInput): RevenueLine {
	return input.productos[0]?.revenueLine ?? "INFRAESTRUCTURA";
}

/** Si algun producto del deal cobra por cuenta. */
export function cobraPorCuenta(input: DealForecastInput): boolean {
	return input.productos.some((p) => p.porCuenta);
}

/** Si algun producto del deal aporta float. Hoy, Cuentas Virtuales. */
export function aportaFloat(input: DealForecastInput): boolean {
	return input.productos.some((p) => p.float);
}

/**
 * El modo del recurrente. El del deal gana si esta cargado; si no, el del
 * producto. Con productos de modos distintos gana PISO, que es el conservador:
 * no suma el minimo arriba del variable.
 */
export function modoRecurrente(input: DealForecastInput): RecurringRule {
	if (input.recurringRule !== null) return input.recurringRule;
	if (input.productos.some((p) => p.modo === "PISO")) return "PISO";
	return "ADITIVO";
}

/**
 * Los meses de setup efectivos. En Cuentas Virtuales el default es 2 cuando el
 * campo esta vacio; en el resto, sin dato son 0 y el go-live es el mes
 * siguiente al close.
 */
export function mesesDeSetupEfectivos(
	input: DealForecastInput,
	params: ForecastParams,
): number {
	if (input.mesesDeSetup !== null) return input.mesesDeSetup;
	if (aportaFloat(input)) return params.mesesDeSetupDefaultCv;
	return 0;
}

export function goLiveOf(
	input: DealForecastInput,
	params: ForecastParams,
): MonthIndex {
	return goLiveMonth(input.closeMonth, mesesDeSetupEfectivos(input, params));
}

/**
 * Las cuentas activas en un mes, ya rampeadas.
 *
 * Cuentas Virtuales compone (5/5/5 y despues x1,68); Infraestructura es lineal.
 * Cual aplica lo decide si el deal aporta float, que es lo que distingue a CV
 * en la matriz, y no el nombre del producto.
 */
export function cuentasDelMes({
	mes,
	input,
	params,
}: {
	mes: MonthIndex;
	input: DealForecastInput;
	params: ForecastParams;
}): Decimal {
	const cuentas = input.cuentasRegimen;
	if (cuentas === null || cuentas <= 0) return CERO;
	if (!cobraPorCuenta(input)) return CERO;

	const goLive = goLiveOf(input, params);
	if (!recurrenteActivo({ mes, goLive, finContrato: input.finContratoMonth })) {
		return CERO;
	}

	return topeDeCuentas(cuentas, params).times(
		fraccionDeRamp({ mes, input, params }),
	);
}

/**
 * Que fraccion del regimen corresponde a este mes, entre 0 y 1.
 *
 * Cuentas Virtuales compone (5/5/5 y despues x1,68); Infraestructura sigue la
 * escalera lineal. Cual aplica lo decide si el deal aporta float, que es lo que
 * distingue a CV en la matriz, y no el nombre del producto.
 */
export function fraccionDeRamp({
	mes,
	input,
	params,
}: {
	mes: MonthIndex;
	input: DealForecastInput;
	params: ForecastParams;
}): Decimal {
	const goLive = goLiveOf(input, params);
	if (!recurrenteActivo({ mes, goLive, finContrato: input.finContratoMonth })) {
		return CERO;
	}

	const m = mesDeRamp(mes, goLive);
	const uno = new Decimal(1);

	if (aportaFloat(input)) {
		return rampCompuesto({
			mes: m,
			tope: uno,
			params: rampParamsOf(params.rampCvCuentas),
			mesesDeRamp: input.mesesDeRamp,
		});
	}

	return rampLineal({ mes: m, tope: uno, mesesDeRamp: input.mesesDeRamp });
}

/**
 * Si el Minimo Mensual rampa junto con el resto, o se factura completo desde
 * el go-live.
 *
 * **En Cuentas Virtuales no rampa; en Infraestructura si.** La especificacion
 * describia solo el caso de CV, donde el minimo es un piso contractual sobre un
 * fee por uso y cobrarlo a medias no tendria sentido. En Infraestructura el
 * minimo es un fee de plataforma que entra a medida que el cliente la adopta.
 *
 * Esto no se dedujo de un documento: los dos describian cosas distintas sin
 * decirlo. Salio de contrastar las 122 oportunidades del Excel v4, donde la
 * separacion es total: 63 de 63 deals de CV se explican **solo** si el minimo
 * no rampa, y 21 de 21 de Infra **solo** si rampa. Cero contraejemplos en
 * cualquiera de las dos direcciones. Confirmado por Ezequiel el 13-oct-26.
 */
export function minimoRampa(input: DealForecastInput): boolean {
	return !aportaFloat(input);
}

/**
 * El tope de cuentas. Con `usarPctActivas` prendido se multiplica por el
 * porcentaje de activas; hoy arranca apagado y se usa Cuentas Regimen directo
 * (D9). La rama esta para poder prender el flag sin tocar codigo.
 */
function topeDeCuentas(
	cuentasRegimen: number,
	params: ForecastParams,
): Decimal {
	const tope = new Decimal(cuentasRegimen);
	if (!params.usarPctActivas) return tope;
	return tope.times(params.pctActivasDefault);
}

/** El saldo vista del mes, ya rampeado. Es lo que aporta al SPP consolidado. */
export function saldoDelMes({
	mes,
	input,
	params,
}: {
	mes: MonthIndex;
	input: DealForecastInput;
	params: ForecastParams;
}): Decimal {
	const saldo = input.saldoVistaMaxClp;
	if (saldo === null || saldo.lessThanOrEqualTo(0)) return CERO;
	if (!aportaFloat(input)) return CERO;

	const goLive = goLiveOf(input, params);
	if (!recurrenteActivo({ mes, goLive, finContrato: input.finContratoMonth })) {
		return CERO;
	}

	return rampCompuesto({
		mes: mesDeRamp(mes, goLive),
		tope: saldo,
		params: rampParamsOf(params.rampCvSaldo),
		mesesDeRamp: input.mesesDeRamp,
	});
}

/** El MRR fijo del mes. Sin duracion es permanente desde el go-live (D8). */
export function mrrFijoDelMes({
	mes,
	input,
	params,
}: {
	mes: MonthIndex;
	input: DealForecastInput;
	params: ForecastParams;
}): Decimal {
	const monto = input.mrrFijoClp;
	if (monto === null || monto.lessThanOrEqualTo(0)) return CERO;

	const goLive = goLiveOf(input, params);
	if (!recurrenteActivo({ mes, goLive, finContrato: input.finContratoMonth })) {
		return CERO;
	}

	const meses = input.mrrFijoMeses;
	if (meses !== null && mesDeRamp(mes, goLive) > meses) return CERO;

	return monto;
}

/**
 * Los componentes de un deal en un mes.
 *
 * El criterio minimo-floor vive aca: **el minimo se factura completo desde el
 * go-live y solo la porcion variable rampa**. Ramparlo tambien es el error que
 * la regla corrige, y es silencioso porque da una curva plausible.
 */
export function componentesDelMes({
	mes,
	input,
	params,
}: {
	mes: MonthIndex;
	input: DealForecastInput;
	params: ForecastParams;
}): ComponentesMes {
	const goLive = goLiveOf(input, params);
	const activo = recurrenteActivo({
		mes,
		goLive,
		finContrato: input.finContratoMonth,
	});

	const setup = cuotaSetup({
		mes,
		close: input.closeMonth,
		setupFeeClp: input.setupFeeClp,
		mesesDeSetup: mesesDeSetupEfectivos(input, params),
	});

	if (!activo) {
		return {
			mes,
			setup,
			mrrFijo: CERO,
			minimo: CERO,
			porCuenta: CERO,
			recurrente: CERO,
			saldoFloat: CERO,
			cuentas: CERO,
		};
	}

	const cuentas = cuentasDelMes({ mes, input, params });
	const porCuenta = cuentas.isZero()
		? CERO
		: revenuePorCuenta(
				tarifaTramosOf(params),
				cuentas,
				params.tarifaMetodoActivo,
			);

	const minimoPleno = input.minimoMensualClp ?? CERO;
	const minimo = minimoRampa(input)
		? minimoPleno.times(fraccionDeRamp({ mes, input, params }))
		: minimoPleno;
	const mrrFijo = mrrFijoDelMes({ mes, input, params });

	const combinado =
		modoRecurrente(input) === "PISO"
			? Decimal.max(minimo, porCuenta)
			: minimo.plus(porCuenta);

	return {
		mes,
		setup,
		mrrFijo,
		minimo,
		porCuenta,
		recurrente: combinado.plus(mrrFijo),
		saldoFloat: saldoDelMes({ mes, input, params }),
		cuentas,
	};
}
