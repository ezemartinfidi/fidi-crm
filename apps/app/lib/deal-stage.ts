import { DealStage } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

/**
 * El orden en que se recorre el pipeline. STAND_BY va al final, despues de las
 * cerradas: es un estado al costado del funnel, no un paso del camino.
 */
const ORDER = [
	DealStage.LEAD,
	DealStage.QUALIFIED,
	DealStage.DISCOVERY,
	DealStage.PROPOSAL,
	DealStage.NEGOTIATION,
	DealStage.WON,
	DealStage.LOST,
	DealStage.STAND_BY,
] as const;

type DealStagePresentation = Record<
	DealStage,
	{ label: string; tone: StatusTone }
>;

/**
 * Las etiquetas son las de Notion, palabra por palabra. El equipo dice "esta en
 * Discovery" y "quedo en Stand By": traducirlas al castellano rompe el vocabulario
 * compartido y obliga a traducir de vuelta en cada conversacion.
 */
const PRESENTATION: DealStagePresentation = {
	LEAD: { label: "Lead", tone: "neutral" },
	QUALIFIED: { label: "Qualified", tone: "info" },
	DISCOVERY: { label: "Discovery", tone: "info" },
	PROPOSAL: { label: "Proposal", tone: "warning" },
	NEGOTIATION: { label: "Negotiation", tone: "warning" },
	WON: { label: "Won", tone: "success" },
	LOST: { label: "Lost", tone: "error" },
	STAND_BY: { label: "Stand By", tone: "neutral" },
};

export const OPEN_STAGES: readonly DealStage[] = [
	DealStage.LEAD,
	DealStage.QUALIFIED,
	DealStage.DISCOVERY,
	DealStage.PROPOSAL,
	DealStage.NEGOTIATION,
];

export const CLOSED_STAGES: readonly DealStage[] = [
	DealStage.WON,
	DealStage.LOST,
];

export const LOSING_STAGES: readonly DealStage[] = [DealStage.LOST];

/** Ni abierta ni cerrada: un deal pausado. */
export const PAUSED_STAGES: readonly DealStage[] = [DealStage.STAND_BY];

export const DEAL_STAGE_OPTIONS = ORDER.map((value) => ({
	value,
	label: PRESENTATION[value].label,
}));

const OPEN_STAGE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
] as const;

/**
 * Solo WON y LOST. Antes esto era `!OPEN_STAGES.includes(stage)`, que con las
 * etapas de upstream daba lo mismo porque solo habia dos estados. Con STAND_BY
 * ya no: un deal pausado no esta cerrado, no lleva closedAt y se puede reactivar.
 */
export function isClosedStage(stage: DealStage): boolean {
	return CLOSED_STAGES.includes(stage);
}

export function isOpenStage(stage: DealStage): boolean {
	return OPEN_STAGES.includes(stage);
}

export function isPausedStage(stage: DealStage): boolean {
	return PAUSED_STAGES.includes(stage);
}

export function dealStageColor(stage: DealStage): string {
	return OPEN_STAGE_COLORS[OPEN_STAGES.indexOf(stage)] ?? "var(--muted)";
}

export function dealStageLabel(stage: DealStage): string {
	return PRESENTATION[stage].label;
}

export function dealStagePresentation(stage: DealStage) {
	return PRESENTATION[stage];
}
