-- Modelos del forecast y de seguimiento de tareas.
--
-- Solo agrega: diez tablas, cuatro enums y la columna activity.ownerId.
-- Ninguna operacion destructiva, asi que es segura sobre una base con datos.
--
-- activity.ownerId va nullable a proposito. Upstream solo tenia createdById,
-- y las actividades existentes no tienen a quien asignarse: ponerla NOT NULL
-- obligaria a inventar un responsable para cada fila vieja.

-- CreateEnum
CREATE TYPE "RecurringRule" AS ENUM ('PISO', 'ADITIVO');

-- CreateEnum
CREATE TYPE "ForecastCategory" AS ENUM ('COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITIR');

-- CreateEnum
CREATE TYPE "ForecastScenario" AS ENUM ('LIVE', 'COMMIT', 'BEST_CASE', 'QUALIFIED');

-- CreateEnum
CREATE TYPE "ForecastParameterSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "dealForecastInput" (
    "dealId" TEXT NOT NULL,
    "forecastCategory" "ForecastCategory",
    "recurringRule" "RecurringRule",
    "cuentasRegimen" INTEGER,
    "saldoVistaMaxClp" DECIMAL(20,2),
    "mesesDeRamp" INTEGER,
    "minimoMensualClp" DECIMAL(18,2),
    "setupFeeClp" DECIMAL(18,2),
    "mesesDeSetup" INTEGER,
    "mrrFijoClp" DECIMAL(18,2),
    "mrrFijoMeses" INTEGER,
    "finContrato" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealForecastInput_pkey" PRIMARY KEY ("dealId")
);

-- CreateTable
CREATE TABLE "forecastParameterSet" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "ForecastParameterSetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "payload" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecastParameterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastTarifaTramo" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "desde" INTEGER NOT NULL,
    "hasta" INTEGER,
    "rateClp" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "forecastTarifaTramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastRevShareTramo" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "desdeClp" DECIMAL(20,2) NOT NULL,
    "hastaClp" DECIMAL(20,2),
    "pctTpm" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "forecastRevShareTramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastProductRule" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cobraSetup" BOOLEAN NOT NULL DEFAULT true,
    "cobraMinimo" BOOLEAN NOT NULL DEFAULT true,
    "cobraPorCuenta" BOOLEAN NOT NULL DEFAULT false,
    "cobraFloat" BOOLEAN NOT NULL DEFAULT false,
    "cobraMrrFijo" BOOLEAN NOT NULL DEFAULT true,
    "modo" "RecurringRule" NOT NULL DEFAULT 'ADITIVO',
    "margenBruto" DECIMAL(6,4),

    CONSTRAINT "forecastProductRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastStageProbability" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "probabilidad" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "forecastStageProbability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastRun" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "label" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "mes1" TEXT NOT NULL,
    "horizonteMeses" INTEGER NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "parameterSetChecksum" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastRunDeal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "scenarioFloor" "ForecastScenario" NOT NULL,
    "mrrDeRegimen" DECIMAL(18,2),

    CONSTRAINT "forecastRunDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecastCell" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenario" "ForecastScenario" NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "monthKey" TEXT NOT NULL,
    "setup" DECIMAL(20,2) NOT NULL,
    "recurrente" DECIMAL(20,2) NOT NULL,
    "float" DECIMAL(20,2) NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "sppConsolidado" DECIMAL(24,2) NOT NULL,
    "cuentas" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "forecastCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activityNudge" (
    "activityId" TEXT NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "lastNudgedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activityNudge_pkey" PRIMARY KEY ("activityId")
);

-- CreateIndex
CREATE INDEX "dealForecastInput_forecastCategory_idx" ON "dealForecastInput"("forecastCategory");

-- CreateIndex
CREATE UNIQUE INDEX "forecastParameterSet_version_key" ON "forecastParameterSet"("version");

-- CreateIndex
CREATE INDEX "forecastParameterSet_status_idx" ON "forecastParameterSet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "forecastTarifaTramo_parameterSetId_desde_key" ON "forecastTarifaTramo"("parameterSetId", "desde");

-- CreateIndex
CREATE UNIQUE INDEX "forecastRevShareTramo_parameterSetId_desdeClp_key" ON "forecastRevShareTramo"("parameterSetId", "desdeClp");

-- CreateIndex
CREATE INDEX "forecastProductRule_productId_idx" ON "forecastProductRule"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "forecastProductRule_parameterSetId_productId_key" ON "forecastProductRule"("parameterSetId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "forecastStageProbability_parameterSetId_stage_key" ON "forecastStageProbability"("parameterSetId", "stage");

-- CreateIndex
CREATE INDEX "forecastRun_createdAt_idx" ON "forecastRun"("createdAt");

-- CreateIndex
CREATE INDEX "forecastRunDeal_dealId_idx" ON "forecastRunDeal"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "forecastRunDeal_runId_dealId_key" ON "forecastRunDeal"("runId", "dealId");

-- CreateIndex
CREATE INDEX "forecastCell_runId_scenario_idx" ON "forecastCell"("runId", "scenario");

-- CreateIndex
CREATE UNIQUE INDEX "forecastCell_runId_scenario_monthIndex_key" ON "forecastCell"("runId", "scenario", "monthIndex");

-- CreateIndex
CREATE INDEX "activityNudge_snoozedUntil_idx" ON "activityNudge"("snoozedUntil");

-- CreateIndex
CREATE INDEX "activityNudge_escalationLevel_idx" ON "activityNudge"("escalationLevel");

-- CreateIndex
CREATE INDEX "activity_ownerId_dueAt_idx" ON "activity"("ownerId", "dueAt");

-- AddForeignKey
ALTER TABLE "dealForecastInput" ADD CONSTRAINT "dealForecastInput_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastTarifaTramo" ADD CONSTRAINT "forecastTarifaTramo_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "forecastParameterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastRevShareTramo" ADD CONSTRAINT "forecastRevShareTramo_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "forecastParameterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastProductRule" ADD CONSTRAINT "forecastProductRule_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "forecastParameterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastProductRule" ADD CONSTRAINT "forecastProductRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastStageProbability" ADD CONSTRAINT "forecastStageProbability_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "forecastParameterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastRun" ADD CONSTRAINT "forecastRun_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "forecastParameterSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastRun" ADD CONSTRAINT "forecastRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastRunDeal" ADD CONSTRAINT "forecastRunDeal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "forecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastRunDeal" ADD CONSTRAINT "forecastRunDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecastCell" ADD CONSTRAINT "forecastCell_runId_fkey" FOREIGN KEY ("runId") REFERENCES "forecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activityNudge" ADD CONSTRAINT "activityNudge_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

