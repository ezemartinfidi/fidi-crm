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

## Fase 0.5 — spikes ✅

- **MCP en Cowork: confirmado** por Ezequiel (12-oct-26)
- **Granola: el conector MCP funciona y alcanza para leer.** Verificado 12-oct-26:
  workspace Fidi, scopes `personal` y `public`, 69 reuniones en 30 días con
  participantes. El plan es `plus`
- La **API REST sigue pidiendo Business**, así que el cron desatendido de la fase 8 no
  se puede hacer con este plan. La alternativa sin costo es una routine de Claude Code
  que lea por MCP: ver `pasos-manuales.md` paso 3

## Base de datos ✅ lista en Neon

Branch `dev` (`br-icy-cloud-b7087fbb`) del proyecto `sweet-cherry-79933523`, en
us-east-1. Las 57 migraciones aplicadas y los datos de referencia de Fidi cargados: 6
productos, 18 campos de deal, 39 opciones. La base `crm_test` del mismo branch también
está migrada.

**El branch de producción (`br-green-lake-b78fo35x`) está vacío**: solo tiene las tablas
de `neon_auth` que creó Neon. Las migraciones nunca corrieron ahí, así que no hay datos
en riesgo todavía.

No se cargó el seed de demo de upstream a propósito: son empresas y deals ficticios que
habría que limpiar antes de importar Notion.

## Correr los tests sin Docker ⚠️ leer antes de confiar en un "todo verde"

El `.env` local apunta al branch `dev` de Neon: `DATABASE_URL` a `neondb`,
`TEST_DATABASE_URL` a `crm_test` y `SHADOW_DATABASE_URL` a `crm_shadow` (Prisma la
borra y la reconstruye en cada `migrate dev`; nunca apuntarla a una base con datos).

**Dos cosas que hay que saber:**

**Turbo cachea los tests, y eso esconde fallas.** Varios "todo verde" de esta rama
fueron cache hits, no corridas reales. Cuando el cambio de schema invalidó el caché
aparecieron 61 tests de telemetría que llevaban tiempo sin ejecutarse y 1 error de lint
preexistente en `tracking.service.ts`. Para verificar de verdad: `bun run test --force`.

**La suite de integración de la API no corre bien contra Neon desde Chile, y no hay
que intentar que corra.** Los números medidos el 12-oct-26:

| Corrida | Tiempo | Resultado |
|---|---|---|
| Suite completa, 0,25 CU | 11 min | 19 fallas de la API |
| Solo la API, 2 CU | **40 min** | **42 fallas** |
| Un archivo solo | 14 s | verde |

Subir el compute lo empeoró, y eso descarta la hipótesis de CPU: **el cuello es la
latencia de red**, no el procesamiento. Cada test de integración hace decenas de
round-trips a us-east-1, y con 37 archivos en paralelo contra una sola base los
timeouts de 5s se disparan y el estado compartido entre archivos se pisa. Tampoco es
cuota: el proyecto lleva 352 segundos de compute consumidos de un plan `free_v3`.

**Y CI tampoco está corriendo.** El workflow existe y levanta `postgres:17-alpine` como
service, pero el fork tiene **cero runs en toda su historia**: GitHub deshabilita los
workflows en los forks hasta que alguien los habilita a mano en la pestaña Actions.
Hasta que eso pase, **no hay ningún gate automático sobre esta rama**.

**Cómo correr la suite de la API desde una máquina lejos de la base.** Dos cambios, y
los dos están medidos:

```bash
cd apps/api
for f in test/*.spec.ts; do bun test --timeout 30000 "./$f"; done
```

**De a un archivo**, no todos en paralelo: eso bajó las fallas de 42 a 11. Y con
**timeout de 30s** en vez de los 5s por defecto, porque un test de integración hace
decenas de round-trips y contra us-east-1 cada uno cuesta ~150ms.

**Cada suite necesita su propia base.** Las dos fallas que quedaban eran contaminación
cruzada: `enrichment-queue` cuenta filas y veía las de corridas anteriores. Hay una base
por suite en el branch `dev`: `crm_pkg_test` para los paquetes y `crm_api_test` para la
API. `TEST_DATABASE_URL` tiene que terminar en `_test`, que el repo lo valida.

Un spec se niega a borrar filas que no creó, con un mensaje que lo explica: *"that is
somebody's access"*. Es la decisión correcta y por eso la salida es una base limpia, no
un `DELETE`.

Con esas tres condiciones la suite de la API cierra en **393 tests, 0 fallas**. O sea
que las 42 fallas del modo paralelo eran todas del entorno, ninguna del código.

La otra salida está documentada arriba: la VM de las sesiones de nube trae **PostgreSQL
16 local**, y apuntar `crm_test` ahí elimina la red del problema.

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

## El modelo sigue la metodología del 7-oct ✅

El motor adoptó las reglas vigentes de Notion (📐 *Metodología de Proyección de Revenue*),
que reemplazan al bloque congelado del 12-ago. Lo que cambió:

| | 12-ago (antes) | 7-oct (ahora) |
|---|---|---|
| Factor del ramp CV | fijo 1,145 / 1,68 | **derivado**: toca el 100% exacto en `Meses de Ramp` |
| Meses planos del ramp | siempre 3 | 3 por defecto, **1 en Toku, Khipu y ETPay** |
| Infra sin Meses de Ramp | escalera 5/10/15 +10pp | **entra directo al tope** |
| El mínimo | rampaba en Infra | **no rampa en ninguna línea** |
| Deal sin Forecast Category | entraba a Qualified | **no entra a ningún escenario** |
| Tarifa por cuenta | cuentas del mes | **Cuentas Régimen** |
| Meses de Setup por defecto | 2 CV, 0 resto | **2 CV, 3 Infra** |
| Horizonte | ago-26, 29 meses | **sep-26, 28 meses** |

Dos consecuencias que vale tener presentes.

**La tarifa del régimen invierte un comportamiento.** Antes, al avanzar la rampa el deal
cruzaba tramos hacia arriba y la tarifa bajaba, así que el ingreso por cuenta caía
durante el crecimiento. Ahora se fija con Cuentas Régimen desde el primer mes.

**Un deal sin categoría es invisible para el forecast.** Es a propósito: un dato faltante
no es una decisión de pipeline. Pero se puede perder plata sin que nada falle, así que el
CRM necesita una vista que los liste. Está pendiente.

**Falta implementar tres reglas especiales** que la metodología describe y el motor no
tiene todavía: la tabla MOU propia de Toku, la duplicación 2028 de cuatro deals (Toku,
Khipu, ETPay, Xpendit) y la absorción del legacy de Tapp en abr-27. No se deducen de los
campos, así que necesitan modelo de datos propio.

**EVAL-F1 quedó sin compuerta.** El Excel v4 es de agosto y ya no es referencia válida:
comparar contra él mide la distancia a un modelo viejo. El fixture se conserva por dos
cosas que siguen valiendo, el parser y la prueba autocontenida del bug del float. La
referencia nueva es la tabla mensual de "Proyección vigente" del 7-oct, y construirla
necesita el extract de Notion.

## Fase 4 — forecast en la API 🟡 backend listo, falta la UI

`apps/api/src/forecast/` expone el motor por tRPC: `forecast.project`,
`forecast.scenarios` y `forecast.byDeal`. 23 routers, 165 procedures.

Todo es Query y ninguna Mutation, porque proyectar no escribe. Congelar un snapshot sí
escribe y va a ser una mutation aparte.

**Los montos viajan como string, no como number.** El motor usa `decimal.js` justamente
porque el punto flotante desvía más allá de la tolerancia en 29 meses encadenados;
serializar a `number` tiraría esa precisión en el último metro.

Si no hay ningún `ForecastParameterSet` con estado `ACTIVE`, cae al v3 congelado del
paquete y lo reporta como versión `v3-builtin`. No es un default silencioso: la versión
viaja en la respuesta.

**Falta:** la pantalla en `apps/app`, el editor de inputs en el deal sheet y el botón de
congelar snapshot.

## Fase 2 — motor de forecast 🟡 primitivos listos

`packages/forecast` (`@crm/forecast`), puro, con `decimal.js`.

Implementado y testeado: parámetros v3 con zod y checksum canónico; tarifa por cuenta
en los métodos `volumen` y `marginal` (EVAL-F5); revenue share por tramos, no
escalonado; ramps compuesto de CV y lineal de Infra (EVAL-F4); timing con go-live,
cuotas de setup y Fin Contrato (EVAL-F7); aritmética de meses por índice absoluto.

**Decisiones del 12-oct-26 ya aplicadas:** el tramo 5 del rev share no existe (el
tramo 4 es abierto, > 20.000 M al 35%, con test que falla si alguien reintroduce el
cliff), y el margen bruto de CV queda **como placeholder a propósito**: no hay test que
fije el 0,70, se testea que siga siendo el complemento del costo variable.

**El motor está completo**: `components.ts`, `project.ts`, `scenarios.ts`,
`aggregate.ts` y `engine.ts`. 76 tests verdes, con EVAL-F2, F4, F5, F6, F7, F8 y F9
cubiertos.

**EVAL-F1 corre y la fase 2 está cerrada.** El SPP consolidado coincide exacto con el
Excel en los 29 meses, y 24 de las 25 oportunidades del escenario que la planilla
muestra caen dentro del 0,2%. La única afuera es Entel, al 12%, sin hipótesis todavía.

Dos cosas se resolvieron contra los datos, no leyendo documentos:

**El mínimo rampa en Infraestructura y no en Cuentas Virtuales.** La especificación y
el Excel no se contradecían: describían líneas distintas. 63 de 63 deals de CV se
explican solo si no rampa, 21 de 21 de Infra solo si rampa, cero contraejemplos.

**El "5/5/5" de la escalera de Infra es acumulativo** (5, 10, 15), no tres meses planos.
Se despejó numéricamente el porcentaje implícito del Excel sobre 23 deals y la mediana
da la tabla exacta en los doce meses, llegando al 100% en el mes 12.

⚠ **Y el Excel tiene un bug: subestima el float.** Multiplica por la TPM una vez de más
(`TPM²` donde va `TPM`). Medido con la tasa de producción de 4,5%, son **527 millones de
CLP** sobre el horizonte, y el float pasa del 0,79% al **13,73%** del revenue. El motor no copia el bug; hay un test que lo fija. Detalle en
`docs/forecast-model.md`.

Tres cosas que conviene saber antes de tocar el motor:

**El rev share no se puede calcular por deal.** Se aplica sobre el Saldo Promedio
Ponderado consolidado de todos los deals del escenario, y no es escalonado. Dos clientes
de 200 M pagan rev share juntos (400 M pasa el umbral de 300 M) y ninguno por separado.
Por eso `aggregate.ts` hace dos pasadas y por eso **un escenario no se deriva restando
otro**.

**Las cuentas son `Decimal`, no entero.** Durante el ramp son fraccionarias: el 5% de
347 cuentas son 17,35. Eso destapó un bug en la selección de tramo, que usaba los bordes
enteros (`1-500`, `501-1.000`) y dejaba huecos: 500,4 no caía en ninguno y tiraba
excepción. Ahora el tramo se elige por el techo.

**`rampLineal()` sin Meses de Ramp llega al 100% en el mes 13, no en el 12.** El Excel
rotula la regla como "lineal 12m (5/5/5, luego +10pp)" y las dos cosas no cierran. Se
implementó la regla, no el rótulo. Si EVAL-F1 difiere en un deal de Infra sin Meses de
Ramp, empezar por ahí.

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
