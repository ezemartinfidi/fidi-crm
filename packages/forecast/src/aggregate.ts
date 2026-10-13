import Decimal from "decimal.js";
import type { ForecastParams } from "./params";
import { revShareTramosOf } from "./params";
import type { DealProjection } from "./project";
import { revShareMensual } from "./revshare";
import type { MonthIndex, RevenueLine } from "./types";

/**
 * La agregacion es de **dos pasadas**, y no es un detalle de implementacion.
 *
 * El rev share se calcula sobre el Saldo Promedio Ponderado **consolidado**: se
 * suman los saldos de todos los deals del escenario y recien ahi se elige el
 * tramo, que no es escalonado. Dos clientes de 200 M cada uno pagan rev share
 * (400 M consolidado pasa el umbral de 300 M); por separado, ninguno.
 *
 * Por eso ningun deal puede calcular su propio float, y por eso sumar
 * proyecciones por deal daria un numero distinto al correcto.
 */
export type MesAgregado = {
	readonly mes: MonthIndex;
	readonly setup: Decimal;
	readonly recurrente: Decimal;
	/** El rev share del mes, del SPP consolidado. */
	readonly float: Decimal;
	readonly total: Decimal;
	/** El SPP consolidado que produjo ese float. */
	readonly sppConsolidado: Decimal;
	readonly cuentas: Decimal;
	readonly porLinea: ReadonlyMap<RevenueLine, Decimal>;
};

const CERO = new Decimal(0);

/**
 * Suma las proyecciones de un escenario y aplica el rev share consolidado.
 *
 * `projections` ya viene filtrada por escenario: filtrar es responsabilidad de
 * `engine.ts`, porque el filtro cambia el SPP y por lo tanto el tramo.
 */
export function aggregate({
	projections,
	params,
}: {
	projections: readonly DealProjection[];
	params: ForecastParams;
}): MesAgregado[] {
	const primera = projections[0];
	if (primera === undefined) return [];

	const tramos = revShareTramosOf(params);

	return primera.meses.map((referencia, indice) => {
		// El mes sale del indice, no del ultimo deal del loop. Si una proyeccion
		// viniera mas corta que las otras, derivarlo del loop dejaria el mes en
		// un valor de otra celda o en cero, y la serie quedaria desalineada sin
		// que nada fallara.
		const mes: MonthIndex = referencia.mes;

		let setup = CERO;
		let recurrente = CERO;
		let spp = CERO;
		let cuentas = CERO;
		const porLinea = new Map<RevenueLine, Decimal>();

		for (const projection of projections) {
			const celda = projection.meses[indice];
			if (celda === undefined) continue;

			setup = setup.plus(celda.setup);
			recurrente = recurrente.plus(celda.recurrente);
			spp = spp.plus(celda.saldoFloat);
			cuentas = cuentas.plus(celda.cuentas);

			const acumulado = porLinea.get(projection.revenueLine) ?? CERO;
			porLinea.set(
				projection.revenueLine,
				acumulado.plus(celda.setup).plus(celda.recurrente),
			);
		}

		// Segunda pasada: el tramo se elige con el SPP ya consolidado.
		const float = revShareMensual({
			spp,
			tramos,
			tpmAnual: params.tpmAnual,
			umbralMinimoClp: params.revShareUmbralMinimoClp,
		});

		// El float es de Cuentas Virtuales por definicion: es el unico producto
		// que aporta saldo, asi que no hay nada que prorratear entre lineas.
		if (!float.isZero()) {
			const acumulado = porLinea.get("CUENTAS_VIRTUALES") ?? CERO;
			porLinea.set("CUENTAS_VIRTUALES", acumulado.plus(float));
		}

		return {
			mes,
			setup,
			recurrente,
			float,
			total: setup.plus(recurrente).plus(float),
			sppConsolidado: spp,
			cuentas,
			porLinea,
		};
	});
}
