import type Decimal from "decimal.js";
import type {
	ForecastCategory,
	MonthIndex,
	RecurringRule,
	RevenueLine,
} from "./types";

/**
 * Lo que el motor necesita saber de un deal. No es una fila de Prisma: el motor
 * es puro y no conoce la base. El borde de la API traduce `Deal` +
 * `DealForecastInput` + `DealProduct` a esta forma.
 *
 * La traduccion es a proposito. Deja el motor testeable sin base de datos y
 * permite reproducir un forecast viejo armando la entrada a mano.
 */

/**
 * Que componentes cobra un producto, de la matriz producto x componente de
 * docs/forecast-model.md.
 *
 * Son banderas y no una union de nombres de producto porque el catalogo cambia:
 * agregar "Core de Credito" tiene que ser una fila de datos, no un caso nuevo en
 * un switch del motor.
 */
export type ProductoComponentes = {
	readonly revenueLine: RevenueLine;
	/** Cobra por cuenta segun la tabla de tarifa. */
	readonly porCuenta: boolean;
	/** Participa del revenue share sobre el float. Hoy solo Cuentas Virtuales. */
	readonly float: boolean;
	/** Como se combina el minimo con el variable por cuenta. */
	readonly modo: RecurringRule;
};

export type DealForecastInput = {
	readonly dealId: string;

	/** Expected Close. Todo el timing se ancla aca. */
	readonly closeMonth: MonthIndex;

	readonly productos: readonly ProductoComponentes[];

	/** El tope del ramp de cuentas. Null = el deal no cobra por cuenta. */
	readonly cuentasRegimen: number | null;
	/** El tope del ramp de saldo, para el float. Null = no aporta float. */
	readonly saldoVistaMaxClp: Decimal | null;
	/**
	 * Define la duracion del ramp. En Cuentas Virtuales tambien define el
	 * factor, porque el ramp tiene que tocar el 100% exacto en este mes.
	 */
	readonly mesesDeRamp: number | null;
	/**
	 * Cuantos meses quedan planos al 5% antes de componer. Null usa el default
	 * de los parametros, que son 3.
	 *
	 * Toku, Khipu y ETPay usan 1: en esos contratos se definio que la rampa
	 * empieza a correr al mes siguiente del go-live.
	 */
	readonly mesesPlanosRamp: number | null;

	readonly minimoMensualClp: Decimal | null;
	readonly setupFeeClp: Decimal | null;
	/** Null usa el default por linea de revenue (2 en Cuentas Virtuales). */
	readonly mesesDeSetup: number | null;

	/** SSPP. Monto mensual fijo. */
	readonly mrrFijoClp: Decimal | null;
	/** Null con `mrrFijoClp` cargado significa permanente, no cero. */
	readonly mrrFijoMeses: number | null;

	readonly finContratoMonth: MonthIndex | null;

	/**
	 * Fuerza el modo del recurrente para todo el deal. Null usa el del producto.
	 * Existe porque la matriz describe el caso tipico, no un contrato firmado.
	 */
	readonly recurringRule: RecurringRule | null;
};

/** El estado de un deal, para decidir a que escenario pertenece. */
export type DealEstado = "WON" | "LOST" | "STAND_BY" | "ABIERTO";

export type DealScenarioInput = {
	readonly dealId: string;
	readonly estado: DealEstado;
	readonly forecastCategory: ForecastCategory | null;
	/** Null excluye el deal de todo escenario: sin Close no se puede proyectar. */
	readonly closeMonth: MonthIndex | null;
};

/** Un deal listo para proyectar: los datos economicos y los de clasificacion. */
export type DealForecast = {
	readonly scenario: DealScenarioInput;
	readonly input: DealForecastInput;
};
