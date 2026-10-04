/**
 * El motor de revenue de Fidi. Especificacion congelada en
 * docs/forecast-model.md.
 *
 * Es puro: sin I/O, sin Date.now(), sin Prisma.
 */

/** Se bumpea ante cualquier cambio de comportamiento del calculo. */
export const ENGINE_VERSION = "0.1.0";

export * from "./month";
export * from "./params";
export * from "./ramp";
export * from "./revshare";
export * from "./tarifa";
export * from "./timing";
export * from "./types";
