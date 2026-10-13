/**
 * Datos de referencia de Fidi: el catalogo de productos y los campos del CRM
 * que hoy viven en Notion.
 *
 * No es data de demo. Es la semilla fija que el loader de la migracion
 * (fase 3) necesita que exista antes de cargar un solo deal, y es idempotente:
 * correrla dos veces no cambia nada.
 *
 *   bun run db:seed:fidi
 */
import { db } from "../src/client";
import {
	FieldEntity,
	FieldType,
	RevenueLine,
} from "../src/generated/prisma/enums";

/**
 * Los seis productos del pipeline. La linea de revenue es una columna y no una
 * regla sobre el nombre: el modelo v3 la definia como "Producto contiene
 * 'Cuentas Virtuales'" y "el resto", que se rompe al renombrar un producto.
 */
const PRODUCTS = [
	{
		key: "core_de_cuentas",
		name: "Core de Cuentas",
		revenueLine: RevenueLine.INFRAESTRUCTURA,
	},
	{
		key: "program_manager",
		name: "Program Manager",
		revenueLine: RevenueLine.INFRAESTRUCTURA,
	},
	{ key: "baas", name: "BaaS", revenueLine: RevenueLine.INFRAESTRUCTURA },
	{
		key: "cuentas_virtuales",
		name: "Cuentas Virtuales",
		revenueLine: RevenueLine.CUENTAS_VIRTUALES,
	},
	{
		key: "movimientos_de_dinero",
		name: "Movimientos de Dinero",
		revenueLine: RevenueLine.INFRAESTRUCTURA,
	},
	{
		key: "forward_deployed_engineers",
		name: "Forward Deployed Engineers",
		revenueLine: RevenueLine.FORWARD_DEPLOYED_ENGINEERS,
	},
] as const;

/**
 * Los campos del pipeline de Notion que son CRM y no entran al modelo de
 * revenue. Los inputs del forecast (marcados con el circulo azul en Notion) NO
 * van aca: son columnas tipadas de DealForecastInput, porque el motor los lee en
 * cada corrida y EAV no da type safety ni rangos.
 *
 * Partner Comercial y Competitor son multi-select en Notion y aca quedan como
 * texto: FieldValue tiene un solo optionId y unique por [fieldId, dealId], asi
 * que no puede representar un conjunto. Producto, que es el multi-select que
 * si importa para el calculo, tiene su propia relacion (DealProduct).
 */
const DEAL_FIELDS = [
	{
		key: "source",
		label: "Source",
		type: FieldType.SELECT,
		options: [
			"Outbound",
			"Inbound",
			"Evento",
			"Referido Cliente",
			"Referido Partner",
			"Referido Banco Consorcio",
			"Referido Banco Internacional",
		],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		key: "motion_de_venta",
		label: "Motion de Venta",
		type: FieldType.SELECT,
		options: [
			"Directo Fidi",
			"Co-venta Banco",
			"Aliado / Reseller",
			"Referido Partner",
		],
		showOnFilter: true,
	},
	{
		key: "country",
		label: "País",
		type: FieldType.SELECT,
		options: [
			"Chile",
			"Perú",
			"México",
			"Colombia",
			"República Dominicana",
			"Guatemala",
		],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		key: "priority",
		label: "Prioridad",
		type: FieldType.SELECT,
		options: ["🔴 Alta", "🟡 Media", "🟢 Baja"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		key: "partner_comercial",
		label: "Partner Comercial",
		type: FieldType.TEXT,
		agentBrief:
			"Partners involucrados, separados por coma. En Notion es multi-select.",
		showOnFilter: true,
	},
	{
		key: "competitor",
		label: "Competidor",
		type: FieldType.TEXT,
		agentBrief:
			"Competidores en el deal, separados por coma. En Notion es multi-select.",
	},
	{
		key: "lost_reason",
		label: "Motivo de pérdida",
		type: FieldType.SELECT,
		options: [
			"Precio",
			"Funcionalidad",
			"Timing",
			"Decisión interna",
			"No fit",
			"Otro",
		],
		showOnFilter: true,
	},
	{ key: "decision_maker", label: "Decision Maker", type: FieldType.TEXT },
	{
		key: "decision_timeline",
		label: "Decision Timeline",
		type: FieldType.SELECT,
		options: ["<3 meses", "3-6 meses", ">6 meses"],
		showOnFilter: true,
	},
	{
		key: "integration_complexity",
		label: "Complejidad de integración",
		type: FieldType.SELECT,
		options: ["Estándar", "Media", "Alta"],
	},
	{
		key: "technical_blocker",
		label: "Bloqueo técnico",
		type: FieldType.CHECKBOX,
		showOnFilter: true,
	},
	{
		key: "estimated_volume",
		label: "Volumen estimado",
		type: FieldType.SELECT,
		options: ["<10k", "10-50k", "50-100k", ">100k"],
	},
	{
		key: "revenue_confidence",
		label: "Confianza del revenue",
		type: FieldType.SELECT,
		options: ["Alta", "Media", "Estimado"],
		agentFilled: false,
	},
	{
		key: "comision_partner_pct",
		label: "Comisión Partner %",
		type: FieldType.NUMBER,
		agentFilled: false,
	},
	{
		key: "expected_go_live",
		label: "Go-Live esperado",
		type: FieldType.DATE,
		agentFilled: false,
	},
	{
		key: "won_date",
		label: "Fecha de cierre ganado",
		type: FieldType.DATE,
		agentFilled: false,
	},
	{
		key: "reactivation_date",
		label: "Fecha de reactivación",
		type: FieldType.DATE,
	},
	{
		key: "gmail_thread_id",
		label: "Gmail Thread ID",
		type: FieldType.TEXT,
		showOnSheet: false,
	},
] as const;

export async function seedProducts() {
	for (const [position, product] of PRODUCTS.entries()) {
		await db.product.upsert({
			where: { key: product.key },
			create: { ...product, position },
			update: {
				name: product.name,
				revenueLine: product.revenueLine,
				position,
			},
		});
	}
	return PRODUCTS.length;
}

export async function seedDealFields() {
	for (const [index, field] of DEAL_FIELDS.entries()) {
		const position = index;
		const definition = await db.fieldDefinition.upsert({
			where: { entity_key: { entity: FieldEntity.DEAL, key: field.key } },
			create: {
				entity: FieldEntity.DEAL,
				key: field.key,
				label: field.label,
				type: field.type,
				agentFilled: "agentFilled" in field ? field.agentFilled : true,
				agentBrief: "agentBrief" in field ? field.agentBrief : null,
				showOnSheet: "showOnSheet" in field ? field.showOnSheet : true,
				showOnTable: "showOnTable" in field ? field.showOnTable : false,
				showOnFilter: "showOnFilter" in field ? field.showOnFilter : false,
				position,
			},
			update: { label: field.label, position },
			select: { id: true },
		});

		const options = "options" in field ? field.options : [];
		for (const [optionPosition, label] of options.entries()) {
			const existing = await db.fieldOption.findFirst({
				where: { fieldId: definition.id, label },
				select: { id: true },
			});
			if (existing) {
				await db.fieldOption.update({
					where: { id: existing.id },
					data: { position: optionPosition },
				});
			} else {
				await db.fieldOption.create({
					data: {
						fieldId: definition.id,
						label,
						position: optionPosition,
					},
				});
			}
		}
	}
	return DEAL_FIELDS.length;
}

async function main() {
	const products = await seedProducts();
	const fields = await seedDealFields();
	console.log(`Semilla Fidi: ${products} productos, ${fields} campos de deal.`);
}

// Solo cuando se corre como script. Importarlo para reusar seedProducts() en un
// test no debe sembrar nada ni cerrar la conexion.
if (import.meta.main) {
	main()
		.catch((error) => {
			console.error(error);
			process.exit(1);
		})
		.finally(() => db.$disconnect());
}
