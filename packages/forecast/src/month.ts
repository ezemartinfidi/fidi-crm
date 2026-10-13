import type { MonthIndex } from "./types";

/**
 * Aritmetica de meses sobre un indice absoluto, para no arrastrar husos horarios
 * a un modelo que razona en meses calendario.
 *
 * Todo el timing del forecast se ancla en el Expected Close, y una fecha con
 * hora puede caer en el mes anterior segun el huso. El indice no tiene ese
 * problema.
 */
export function monthIndexOf(date: Date): MonthIndex {
	return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function monthIndexFromKey(key: string): MonthIndex {
	const match = /^(\d{4})-(\d{2})$/.exec(key);
	if (!match) {
		throw new Error(`Mes invalido: "${key}". Se espera YYYY-MM.`);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) {
		throw new Error(`Mes invalido: "${key}". El mes va de 01 a 12.`);
	}
	return year * 12 + (month - 1);
}

export function monthKeyOf(index: MonthIndex): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;
	return `${year}-${String(month).padStart(2, "0")}`;
}

/** El primer dia del mes, en UTC. Para guardar una celda con fecha. */
export function monthStartOf(index: MonthIndex): Date {
	return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
}

/** Los indices de `count` meses consecutivos desde `start`, denso y en orden. */
export function monthRange(start: MonthIndex, count: number): MonthIndex[] {
	return Array.from({ length: count }, (_, offset) => start + offset);
}
