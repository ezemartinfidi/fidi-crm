-- Fase 1: Fidi-ficacion del core.
--   * DealStage pasa a las 8 etapas del pipeline de Fidi (incluye STAND_BY).
--   * CLP como moneda por defecto de un deal.
--   * notionPageId: identidad de origen para la migracion desde Notion.
--   * Product / DealProduct: el multi-select de Producto, que el sistema de
--     campos custom no puede representar.

-- CreateEnum
CREATE TYPE "RevenueLine" AS ENUM ('CUENTAS_VIRTUALES', 'FORWARD_DEPLOYED_ENGINEERS', 'INFRAESTRUCTURA');

-- AlterEnum
BEGIN;
CREATE TYPE "DealStage_new" AS ENUM ('LEAD', 'QUALIFIED', 'DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'STAND_BY');
ALTER TABLE "public"."deal" ALTER COLUMN "stage" DROP DEFAULT;
-- Mapeo explicito de las etapas de trycompai a las de Fidi.
-- El cast directo a texto falla: los valores viejos no existen en el enum nuevo.
-- UNQUALIFIED_TO_BUY y CLOSED_LOST colapsan en LOST: Fidi no distingue un lead
-- descalificado de un deal perdido. STAND_BY no tiene origen, es nuevo.
ALTER TABLE "deal" ALTER COLUMN "stage" TYPE "DealStage_new" USING (
  CASE "stage"::text
    WHEN 'DEMO_BOOKED'              THEN 'LEAD'
    WHEN 'QUALIFIED_TO_BUY'         THEN 'QUALIFIED'
    WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'NEGOTIATION'
    WHEN 'CONTRACT_SENT'            THEN 'PROPOSAL'
    WHEN 'CLOSED_WON'               THEN 'WON'
    WHEN 'CLOSED_LOST'              THEN 'LOST'
    WHEN 'UNQUALIFIED_TO_BUY'       THEN 'LOST'
  END
)::"DealStage_new";
ALTER TYPE "DealStage" RENAME TO "DealStage_old";
ALTER TYPE "DealStage_new" RENAME TO "DealStage";
DROP TYPE "public"."DealStage_old";
ALTER TABLE "deal" ALTER COLUMN "stage" SET DEFAULT 'LEAD';
COMMIT;

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "notionPageId" TEXT;

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "notionPageId" TEXT;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "notionPageId" TEXT;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "notionPageId" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'CLP';

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revenueLine" "RevenueLine" NOT NULL,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealProduct" (
    "dealId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "dealProduct_pkey" PRIMARY KEY ("dealId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_key_key" ON "product"("key");

-- CreateIndex
CREATE INDEX "product_position_idx" ON "product"("position");

-- CreateIndex
CREATE INDEX "dealProduct_productId_idx" ON "dealProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_notionPageId_key" ON "activity"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "company_notionPageId_key" ON "company"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_notionPageId_key" ON "contact"("notionPageId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_notionPageId_key" ON "deal"("notionPageId");

-- AddForeignKey
ALTER TABLE "dealProduct" ADD CONSTRAINT "dealProduct_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealProduct" ADD CONSTRAINT "dealProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
