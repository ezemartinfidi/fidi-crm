import Decimal from "decimal.js";
import type { MonthIndex } from "./types";

/**
 * Todo el timing se ancla en el Expected Close. Es el unico dato de fecha que
 * se carga; el resto se deriva.
 */

/**
 * El go-live: el mes siguiente a la ultima cuota de setup.
 *
 *     go_live = close + meses_de_setup + 1
 *
 * Vale igual cuando no hay Setup Fee: en Cuentas Virtuales el fee es opcional,
 * pero el go-live se calcula con los meses de setup de todas formas.
 */
export function goLiveMonth(
	close: MonthIndex,
	mesesDeSetup: number,
): MonthIndex {
	return close + mesesDeSetup + 1;
}

/**
 * La cuota de setup de un mes. Cuotas iguales desde el mes **siguiente** al
 * close, por `mesesDeSetup` meses. Sin fee, no hay cuotas.
 */
export function cuotaSetup({
	mes,
	close,
	setupFeeClp,
	mesesDeSetup,
}: {
	mes: MonthIndex;
	close: MonthIndex;
	setupFeeClp: Decimal | null;
	mesesDeSetup: number;
}): Decimal {
	if (setupFeeClp === null || setupFeeClp.lessThanOrEqualTo(0))
		return new Decimal(0);
	if (mesesDeSetup <= 0) return new Decimal(0);

	const primera = close + 1;
	const ultima = close + mesesDeSetup;
	if (mes < primera || mes > ultima) return new Decimal(0);

	return setupFeeClp.dividedBy(mesesDeSetup);
}

/**
 * Si el contrato tiene fin, el recurrente se factura **hasta ese mes inclusive**
 * y es 0 desde el siguiente. Los setup fees no se ven afectados.
 */
export function recurrenteActivo({
	mes,
	goLive,
	finContrato,
}: {
	mes: MonthIndex;
	goLive: MonthIndex;
	finContrato: MonthIndex | null;
}): boolean {
	if (mes < goLive) return false;
	if (finContrato !== null && mes > finContrato) return false;
	return true;
}

/** Cuantos meses lleva corriendo el recurrente. 1 en el go-live, 0 antes. */
export function mesDeRamp(mes: MonthIndex, goLive: MonthIndex): number {
	return mes < goLive ? 0 : mes - goLive + 1;
}
