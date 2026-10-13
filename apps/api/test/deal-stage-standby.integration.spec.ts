import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import {
	CLOSED_DEAL_STAGES,
	isClosedStage,
	isOpenStage,
	isPausedStage,
	OPEN_DEAL_STAGES,
	PAUSED_DEAL_STAGES,
} from "@crm/db/deal-stage";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

/**
 * EVAL-C1 — STAND_BY.
 *
 * Upstream solo conocia dos estados, abierto y cerrado, y en varios lugares lo
 * cerrado se derivaba como "todo lo que no esta abierto". Fidi tiene una tercera
 * etapa: un deal pausado, que no avanza pero tampoco se perdio.
 *
 * Si se cuela como abierto, infla el valor del pipeline y recibe alertas de
 * enfriamiento para siempre. Si se cuela como cerrado, se le escribe closedAt y
 * la reactivacion queda rara. Los dos fallos son silenciosos, y por eso esto se
 * testea en vez de confiar en la lectura del codigo.
 */

const suffix = process.env.TEST_RUN_ID ?? "standby-spec";
const userId = `user-${suffix}`;
const domain = `standby-${suffix}.test`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;
const conversion = new ConversionService(db);
const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	conversion,
	new FieldsService(db, {
		fieldBackfill: async () => undefined,
		fieldBackfillRecords: async () => undefined,
	} as never),
);

let companyId: string;

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Stand By Spec",
			email: `${userId}@example.test`,
		},
		update: {},
	});
	const company = await db.company.upsert({
		where: { domain },
		create: { name: `Stand By ${suffix}`, domain, ownerId: userId },
		update: {},
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("los conjuntos de etapas", () => {
	it("deja STAND_BY fuera de abiertas y de cerradas", () => {
		expect([...OPEN_DEAL_STAGES]).not.toContain(DealStage.STAND_BY);
		expect([...CLOSED_DEAL_STAGES]).not.toContain(DealStage.STAND_BY);
		expect([...PAUSED_DEAL_STAGES]).toEqual([DealStage.STAND_BY]);
	});

	it("no la cuenta ni como cerrada ni como abierta", () => {
		expect(isClosedStage(DealStage.STAND_BY)).toBe(false);
		expect(isOpenStage(DealStage.STAND_BY)).toBe(false);
		expect(isPausedStage(DealStage.STAND_BY)).toBe(true);
	});

	it("cubre las ocho etapas entre los tres conjuntos, sin solaparse", () => {
		const all = [
			...OPEN_DEAL_STAGES,
			...CLOSED_DEAL_STAGES,
			...PAUSED_DEAL_STAGES,
		];
		expect(new Set(all).size).toBe(all.length);
		expect(new Set(all)).toEqual(new Set(Object.values(DealStage)));
	});
});

describe("un deal en STAND_BY", () => {
	it("no recibe closedAt: pausar no es cerrar", async () => {
		const deal = await deals.create({
			name: `Pausado ${suffix}`,
			companyId,
			ownerId: userId,
			stage: DealStage.STAND_BY,
		} as never);

		const row = await db.deal.findUniqueOrThrow({
			where: { id: deal.id },
			select: { stage: true, closedAt: true },
		});

		expect(row.stage).toBe(DealStage.STAND_BY);
		expect(row.closedAt).toBeNull();
	});

	it("no aparece en el pipeline abierto", async () => {
		await deals.create({
			name: `Abierto ${suffix}`,
			companyId,
			ownerId: userId,
			stage: DealStage.NEGOTIATION,
		} as never);

		const open = await db.deal.findMany({
			where: { companyId, stage: { in: [...OPEN_DEAL_STAGES] } },
			select: { stage: true },
		});

		expect(open.every((d) => d.stage !== DealStage.STAND_BY)).toBe(true);
		expect(open.some((d) => d.stage === DealStage.NEGOTIATION)).toBe(true);
	});

	it("tampoco aparece en el cerrado, asi que no infla ninguno de los dos", async () => {
		const closed = await db.deal.findMany({
			where: { companyId, stage: { in: [...CLOSED_DEAL_STAGES] } },
			select: { stage: true },
		});

		expect(closed.every((d) => d.stage !== DealStage.STAND_BY)).toBe(true);
	});
});
