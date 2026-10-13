import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "decimal.js";

/**
 * Lector de los volcados del Excel v4.
 *
 * Los `.raw.txt` son el CSV de cada hoja con los saltos de linea aplanados a
 * espacios, asi que no se pueden leer por lineas.
 *
 * El espacio solo no alcanza para encontrar el borde de fila, porque hay campos
 * de texto sin comillas que tambien lo contienen: "Aramark — AramarkPay
 * (legacy)" se parte al medio y la fila queda corrida una columna, en silencio.
 * Lo que si funciona es contar: cada hoja tiene un ancho fijo, y un espacio que
 * aparece cuando la fila ya junto ese ancho **es** el salto de linea.
 *
 * Por eso `parseSheet` pide el ancho. Adivinarlo da datos plausibles y mal
 * alineados, que es el peor resultado posible para un fixture de validacion.
 *
 * Importa que el fixture quede exactamente como salio: es la unica salida
 * conocida-buena del modelo, y normalizarlo a mano seria editar la evidencia.
 */

const DIR = import.meta.dirname;

/** El ancho de cada hoja del Excel v4, en columnas. */
export const ANCHO = { pipeline: 22, revenue: 34, supuestos: 7 } as const;

/** Parsea el volcado de una hoja a filas de campos, dado su ancho. */
export function parseSheet(raw: string, ancho: number): string[][] {
	const filas: string[][] = [];
	let fila: string[] = [];
	let campo = "";
	let enComillas = false;

	const cortar = () => {
		fila.push(campo);
		campo = "";
		filas.push(fila);
		fila = [];
	};

	const texto = raw.trim();
	for (let i = 0; i < texto.length; i++) {
		const ch = texto[i];

		if (enComillas) {
			if (ch !== '"') {
				campo += ch;
				continue;
			}
			// Comilla doble escapada dentro del campo.
			if (texto[i + 1] === '"') {
				campo += '"';
				i++;
				continue;
			}
			enComillas = false;
			if (texto[i + 1] === " " && fila.length >= ancho - 1) {
				cortar();
				i++;
			}
			continue;
		}

		if (ch === '"') {
			enComillas = true;
		} else if (ch === ",") {
			fila.push(campo);
			campo = "";
			if (texto[i + 1] === " " && fila.length >= ancho) {
				filas.push(fila);
				fila = [];
				i++;
			}
		} else if (ch === " " && fila.length >= ancho - 1) {
			// La fila ya esta completa: este espacio es el salto de linea.
			cortar();
		} else {
			campo += ch;
		}
	}

	fila.push(campo);
	filas.push(fila);
	return filas;
}

export function loadSheet(nombre: string, ancho: number): string[][] {
	return parseSheet(readFileSync(join(DIR, nombre), "utf8"), ancho);
}

/**
 * Un numero del Excel: `"$1,400,000"` a Decimal.
 *
 * El guion solo y la celda vacia son **ausencia**, no cero, y por eso devuelve
 * null. La diferencia importa: un deal sin Saldo Vista Max no aporta float, y
 * tratarlo como cero daria lo mismo por casualidad hasta que alguien divida.
 */
export function parseMonto(celda: string | undefined): Decimal | null {
	if (celda === undefined) return null;
	const limpio = celda.replace(/[$\s,]/g, "").replace(/ /g, "");
	if (limpio === "" || limpio === "-" || limpio === "—") return null;
	const valor = new Decimal(limpio);
	return valor.isNaN() ? null : valor;
}

/** Un entero del Excel. Mismo criterio: guion y vacio son ausencia. */
export function parseEntero(celda: string | undefined): number | null {
	const valor = parseMonto(celda);
	return valor === null ? null : valor.toNumber();
}

/** Un porcentaje: `"35%"` a 0,35. */
export function parsePorcentaje(celda: string | undefined): Decimal | null {
	if (celda === undefined) return null;
	const limpio = celda.trim();
	if (!limpio.endsWith("%")) return parseMonto(limpio);
	const valor = parseMonto(limpio.slice(0, -1));
	return valor === null ? null : valor.dividedBy(100);
}

/**
 * La serie mensual de una fila, de las 29 columnas de meses.
 *
 * Las cinco primeras columnas son la etiqueta y relleno; los meses empiezan en
 * la sexta. Una celda vacia o con guion es cero: en una serie temporal "no hay
 * revenue este mes" es cero de verdad, a diferencia de un parametro ausente.
 */
export function parseSerie(fila: string[], meses = 29): Decimal[] {
	return Array.from(
		{ length: meses },
		(_, i) => parseMonto(fila[5 + i]) ?? new Decimal(0),
	);
}

/** La primera fila cuya etiqueta arranca con `prefijo`. */
export function findRow(
	filas: readonly string[][],
	prefijo: string,
): string[] | undefined {
	return filas.find((fila) => fila[0]?.startsWith(prefijo) === true);
}
