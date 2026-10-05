# Fidi — lo que este fork cambia

Fork de `trycompai/crm` para reemplazar el CRM de Fidi que vive en Notion. El plan
completo está aprobado; esto es el índice de lo propio.

| Trabajando en | Leé primero |
| --- | --- |
| Cualquier cosa del forecast, tarifas, ramps, rev share | `docs/forecast-model.md` |
| Dónde está parada la migración y qué falta | `docs/fidi/estado.md` |
| Credenciales, cuentas, decisiones pendientes | `docs/fidi/pasos-manuales.md` |

## Reglas duras

**Node 24.** El `package.json` dice `>=24` y el `.nvmrc` fija 24.13.1. `eve` no
compila con 22, aunque upstream declare `>=22`.

**No hay Docker.** Postgres es Neon. `DATABASE_URL` apunta a la nube, no a
`localhost`. Los comandos destructivos (`db:seed`, `db:reset`, `db:migrate`,
`db:push`) exigen `ALLOW_REMOTE_DB=1` por el guardrail de
`packages/db/scripts/require-local-db.ts`, que existe justamente para que nadie
borre producción. **Ese `DATABASE_URL` nunca debe apuntar al branch de producción.**

**La base de tests no tiene por qué ser Neon.** Las sesiones de nube traen
PostgreSQL 16 preinstalado, apagado por defecto. Levantarlo y apuntar `crm_test`
a `localhost` es más rápido que ir a Neon en cada test y además satisface el
guardrail sin `ALLOW_REMOTE_DB=1`, porque efectivamente es local. El snapshot
cacheado del entorno no conserva procesos corriendo, así que hay que arrancarlo
por sesión.

**Las dependencias se instalan solas.** `scripts/install-deps.sh` corre por el
hook `SessionStart` de `.claude/settings.json`, en local y en la nube, al abrir y
al reanudar. Nunca corta la sesión: si falla, avisa y sigue. El `postinstall` de
`bun install` además engancha `core.hooksPath .githooks`, así que el hook de
pre-push que corre la suite queda activo sin hacer nada.

**El motor de forecast es puro.** `packages/forecast` no hace I/O, no llama a
`Date.now()` y no toca Prisma. Usa `decimal.js`, nunca `number`: el modelo tiene
redondeos explícitos y acantilados por tramo, y el punto flotante desvía más allá
de la tolerancia contra el Excel.

**El motor nunca toca `baseAmount`, `fxRate` ni `ExchangeRate`.** Ese es el otro
sistema de conversión, el del CRM, que congela la tasa al escribir.

## Lo que diverge de upstream, y por qué

**`DealStage` tiene ocho etapas, no siete.** Son las de Fidi: `LEAD`, `QUALIFIED`,
`DISCOVERY`, `PROPOSAL`, `NEGOTIATION`, `WON`, `LOST`, `STAND_BY`.

`STAND_BY` es la que importa. Upstream asumía dos estados; Fidi tiene tres, porque
un deal pausado no está avanzando pero tampoco se perdió. Por eso existe
`PAUSED_DEAL_STAGES` y por eso **toda consulta de pipeline abierto usa
`OPEN_DEAL_STAGES` de forma explícita, nunca `!isClosedStage(...)`**. Si se cuela
como abierto infla el pipeline y recibe alertas para siempre; si se cuela como
cerrado se le escribe `closedAt` y la reactivación queda rara. Los dos fallos son
silenciosos: los cubre `apps/api/test/deal-stage-standby.integration.spec.ts`.

**CLP es la moneda de reporte.** Está primero en `packages/db/src/currency.ts`, con
`minorUnits: 0` porque un peso no se divide en centavos.

**`Product` y `DealProduct` son una relación propia, no un campo custom.** En Notion
`Producto` es multi-select, y `FieldValue` guarda un solo `optionId` por
`[fieldId, dealId]`, así que no puede representar un conjunto. Además el motor
necesita la línea de revenue de cada producto tipada, no una etiqueta de texto.

**`notionPageId`** en `Deal`, `Company`, `Contact` y `Activity` es la clave de
import, nunca el título. Es lo que hace idempotente re-ejecutar la migración.

## Cómo correr esto

```bash
nvm use                                  # 24.13.1
bun install                              # el hook SessionStart ya lo corrio
bun run db:deploy                        # migraciones
ALLOW_REMOTE_DB=1 bun run db:seed        # datos de demo
ALLOW_REMOTE_DB=1 bun run --filter=@crm/db db:seed:fidi   # productos y campos
bun run test
```

Para entrar a la app sin Google OAuth, hay un helper de desarrollo:

```bash
cd apps/api && bun run dev:session <tu-email>
# imprime la cookie crm.session_token para pegar en el browser
```

## Lo que falta

El motor de forecast tiene los primitivos (tarifa, rev share, ramps, timing) pero
le falta `project.ts`, `scenarios.ts`, `aggregate.ts` y `engine.ts`. Esas piezas
solo se pueden escribir contra la salida real del Excel, cuyos fixtures están en
`packages/forecast/test/fixtures/`.

**Antes de escribir EVAL-F1, leé la sección de hallazgos de
`docs/forecast-model.md`.** Hay dos parámetros en los que el Excel y Notion
difieren, y dos preguntas abiertas que no se resuelven leyendo archivos.
