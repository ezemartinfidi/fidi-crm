# Estado de la migración

Rama: `fase-1/fidi-core`. Fork de `trycompai/crm`, con `upstream` configurado para poder
cherry-pickear fixes de seguridad.

> **El repo vive en `~/dev/fidi-crm`, fuera de `~/Documents`.** No moverlo a una carpeta
> sincronizada con iCloud: los archivos quedan evicted, las lecturas fallan con
> `ETIMEDOUT` y `bun`, `git` y `turbo` se cuelgan sin explicación.

## Fase 0 — fork vivo ✅

- Fork en `ezemartinfidi/fidi-crm` (rama por defecto: `release`, no `main`)
- Postgres local en Docker, volumen **named** (`fidi-crm_crm-postgres`), así que la base
  sobrevive a mover el repo
- **Node 24** fijado en `.nvmrc`: `eve` lo exige, aunque el `package.json` raíz declare
  `>=22`. Con Node 22 el build del agente falla

## Fase 0.5 — spikes ⚠️ parcial

- Granola: endpoint verificado (`public-api.granola.ai/v1/notes` responde 401 con
  formato correcto). **Falta la API key** para confirmar que el plan lo permite
- MCP en Cowork: **sin verificar**, necesita revisar el plan de Claude de Fidi

## Fase 1 — Fidi-ficación del core ✅

| Qué | Dónde |
|---|---|
| CLP agregado y puesto como moneda de reporte | `packages/db/src/currency.ts` |
| `DealStage` forkeado a las 8 etapas de Fidi | `schema.prisma`, migración `fidi_core` |
| `PAUSED_DEAL_STAGES` y `isPausedStage` | `packages/db/src/deal-stage.ts` |
| Etiquetas con el vocabulario de Notion | `apps/app/lib/deal-stage.ts` |
| `notionPageId` en Deal, Company, Contact, Activity | `schema.prisma` |
| `Product` + `DealProduct` (el multi-select) | `schema.prisma`, `apps/api/src/products/` |
| Selector de productos en el deal sheet | `apps/app/components/crm/deal-products.tsx` |
| Semilla de 6 productos y 18 campos CRM | `packages/db/prisma/seed-fidi.ts` |
| Telemetría a upstream apagada | `.env` |

**La migración del enum mapea los datos existentes**, no hace un cast directo: los
valores viejos no existen en el enum nuevo y el cast falla. `UNQUALIFIED_TO_BUY` y
`CLOSED_LOST` colapsan en `LOST`.

**Auditoría de `STAND_BY` hecha:** todas las queries de pipeline ya usaban
`OPEN_DEAL_STAGES` explícito, así que un deal pausado queda fuera por construcción.
Verificado por EVAL-C1.

## Fase 2 — motor de forecast 🟡 primitivos listos

`packages/forecast` (`@crm/forecast`), puro, con `decimal.js`.

Implementado y testeado: parámetros v3 con zod y checksum canónico; tarifa por cuenta
en los métodos `volumen` y `marginal` (EVAL-F5); revenue share por tramos, no
escalonado; ramps compuesto de CV y lineal de Infra (EVAL-F4); timing con go-live,
cuotas de setup y Fin Contrato (EVAL-F7); aritmética de meses por índice absoluto.

**Falta:** `project.ts`, `scenarios.ts`, `aggregate.ts` y `engine.ts`. Son las piezas
que solo se pueden escribir contra la salida real del Excel, y EVAL-F1 es la compuerta
que habilita importar datos.

Los fixtures del Excel v4 ya están en `packages/forecast/test/fixtures/`. Leer la
sección de hallazgos de [`docs/forecast-model.md`](../forecast-model.md) antes de
escribir EVAL-F1: **hay dos parámetros en los que el Excel y Notion difieren.**

## Cómo correr esto

```bash
cd ~/dev/fidi-crm
nvm use                 # lee .nvmrc -> 24.13.1
docker compose up -d
bun install
bun run db:deploy
bun run db:seed                          # datos de demo
bun run --filter=@crm/db db:seed:fidi    # productos y campos de Fidi
bun run test
```

Para entrar a la app sin Google OAuth:

```bash
cd apps/api && bun run dev:session ezequiel@fidi.money
# devuelve la cookie crm.session_token para pegar en el browser
```
