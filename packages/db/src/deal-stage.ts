import { DealStage } from "./generated/prisma/enums";

/**
 * Las etapas del pipeline de Fidi.
 *
 * Upstream asumia dos estados, abierto y cerrado. Fidi tiene tres: STAND_BY es
 * un deal pausado — no esta avanzando, pero tampoco se perdio. Tratarlo como
 * abierto infla el pipeline y le manda alertas de enfriamiento para siempre;
 * tratarlo como cerrado le pone fecha de cierre y hace rara la reactivacion.
 *
 * Por eso toda consulta de pipeline abierto usa OPEN_DEAL_STAGES de forma
 * explicita, y nunca `!isClosedStage(...)`.
 */
export const OPEN_DEAL_STAGES = [
	DealStage.LEAD,
	DealStage.QUALIFIED,
	DealStage.DISCOVERY,
	DealStage.PROPOSAL,
	DealStage.NEGOTIATION,
] as const;

export const CLOSED_DEAL_STAGES = [DealStage.WON, DealStage.LOST] as const;

export const LOSING_DEAL_STAGES = [DealStage.LOST] as const;

/** Ni abierta ni cerrada. Ver el comentario de arriba. */
export const PAUSED_DEAL_STAGES = [DealStage.STAND_BY] as const;

const OPEN = new Set<DealStage>(OPEN_DEAL_STAGES);
const CLOSED = new Set<DealStage>(CLOSED_DEAL_STAGES);
const PAUSED = new Set<DealStage>(PAUSED_DEAL_STAGES);

/** Solo WON y LOST. STAND_BY es false: no esta cerrado. */
export function isClosedStage(stage: DealStage): boolean {
	return CLOSED.has(stage);
}

/** Lo que cuenta como pipeline vivo. STAND_BY es false: no esta avanzando. */
export function isOpenStage(stage: DealStage): boolean {
	return OPEN.has(stage);
}

export function isPausedStage(stage: DealStage): boolean {
	return PAUSED.has(stage);
}
