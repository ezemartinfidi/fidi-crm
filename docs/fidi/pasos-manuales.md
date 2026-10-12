# Pasos manuales pendientes

Todo lo que requiere una cuenta, una tarjeta o una decisión que no puedo tomar leyendo
archivos. Ordenado por lo que bloquea antes.

## Resueltos

- ~~**Vercel Pro**~~ — hecho.
- ~~**Google OAuth para entrar localmente**~~ — no hace falta. Ver abajo.
- ~~**Encontrar el Excel del modelo**~~ — es `Fidi_Revenue_Model_v4_Notion.xlsx`,
  ya está exportado en `packages/forecast/test/fixtures/`.
- ~~**El repo en iCloud**~~ — movido a `~/dev/fidi-crm`.
- ~~**Node 24 en Vercel**~~ — ya estaba. Verificado por API el 12-oct-26: los tres
  proyectos en `24.x`.
- ~~**Branch `dev` de Neon, migraciones y seed**~~ — hecho el 12-oct-26. Ver paso 1.
- ~~**Conectores MCP custom en el plan de Claude**~~ — confirmado por Ezequiel.
- ~~**Tramo 5 del rev share**~~ — no existe. El tramo 4 (> 20.000 M al 35%) es el último
  y es abierto.
- ~~**Margen bruto de Cuentas Virtuales**~~ — queda como placeholder, a propósito. No
  hay test que fije el 0,70; se testea la relación con el costo variable.

## Bloqueantes

### 0. La pregunta para Pancho que destraba EVAL-F1

**¿El Mínimo Mensual rampa, o se factura completo desde el go-live?**

La especificación dice que se factura completo y que ramparlo es un error. El Excel v4
lo rampa, al menos en Infraestructura. Correr EVAL-F1 mostró que es la única diferencia
estructural que queda: 59 de 122 oportunidades ya reproducen el Excel exacto, 17 más
están dentro del 0,2%, y las 46 restantes difieren solo por esto.

La diferencia es material: en un deal de 2.000.000 de mínimo, el primer mes son 100.000
contra 2.000.000.

Detalle completo en `docs/forecast-model.md`, sección "El Excel rampa el mínimo".


### 1. El entorno de nube en claude.ai/code

**La base ya está lista.** El 12-oct-26 se creó el branch `dev` de Neon, se aplicaron las
57 migraciones y se cargaron los datos de referencia de Fidi. No hay nada que hacer del
lado de la base.

| | |
|---|---|
| Proyecto Neon | `sweet-cherry-79933523` (`fidi-crm-neon`), org `org-crimson-bread-43210851` |
| Branch dev | `br-icy-cloud-b7087fbb`, endpoint `ep-morning-sound-b7vf9l7f` |
| Branch producción | `br-green-lake-b78fo35x`, endpoint `ep-solitary-union-b7993m9y` |
| Región | **us-east-1** |
| Bases en dev | `neondb` (la app) y `crm_test` (la suite), las dos migradas |
| Cargado en `neondb` | 6 productos, 18 campos de deal, 39 opciones |

**Lo que no puedo hacer yo**, porque es un flujo de OAuth por UI. En claude.ai/code →
selector de entorno → **New environment**:

| Campo | Valor |
|---|---|
| Repository | `ezemartinfidi/fidi-crm` |
| Branch | `fase-1/fidi-core` |
| Network access | **Custom** |
| → Allowed domains | `*.c-13.us-east-1.aws.neon.tech` |
| → Checkbox | ✅ **"Also include default list of common package managers"** |
| Setup script | el contenido de `scripts/cloud-setup.sh` |

El comodín en Allowed domains es a propósito: cada branch de Neon tiene su propio
endpoint, así que un host fijo se rompe la próxima vez que creemos uno. Si preferís
cerrarlo, el host exacto de dev es
`ep-morning-sound-b7vf9l7f.c-13.us-east-1.aws.neon.tech`.

Si no tildás el checkbox de package managers, `bun install` no llega al registry.

**Environment variables.** Las dos de Neon apuntan al branch `dev`, nunca a producción.
Pedímelas y te las paso, o sacalas con el MCP de Neon.

```
DATABASE_URL=<pooled de dev, base neondb>
DIRECT_DATABASE_URL=<unpooled de dev, base neondb>
BETTER_AUTH_SECRET=<el mismo de los proyectos de Vercel>
AGENT_BRIDGE_SECRET=<ídem>
ALLOWED_SIGN_IN=fidi.money
CRM_TELEMETRY_DISABLED=1
NODE_ENV=development
```

Al lanzar la sesión, habilitá los conectores de **Notion** y **Granola**. No necesitan
credenciales.

> **Latencia.** Aplicar las migraciones desde Chile contra us-east-1 tardó 1m52s. Es
> ida y vuelta de red, no trabajo real. Desde la VM de la sesión de nube debería ser
> mucho menos, y medirlo es parte de la primera tarea.

### 2. La app de GitHub de Claude

Instalarla en `ezemartinfidi/fidi-crm` para que las sesiones de nube puedan clonar y
pushear. Es un clic en el flujo de creación del entorno.

## Verificaciones pendientes (fase 0.5)

### 3. Granola: API key para el cron desatendido

**El conector MCP ya funciona y alcanza para leer.** Verificado el 12-oct-26: cuenta
`ezequiel@fidi.money`, workspace Fidi, scopes `personal` y `public`, 69 reuniones en los
últimos 30 días con participantes y títulos. O sea que una sesión de Claude puede leer
Granola hoy, sin API key.

Lo que **no** se puede hacer sin API key es el cron desatendido de la fase 8: un cron de
Vercel pegándole a `public-api.granola.ai/v1/notes` cada 15 minutos sin que haya una
sesión de Claude abierta.

**El plan actual es `plus`, y la API REST pide Business.** Así que hay dos caminos:

| Camino | Qué cuesta | Qué se gana |
|---|---|---|
| **A. Subir a Granola Business** | Plata | El cron de Vercel del plan original, 100% desatendido |
| **B. Routine de Claude Code** | Nada | Un agente programado lee Granola por MCP y escribe al CRM por MCP |

**B es la recomendación.** No cuesta nada, funciona con el plan que ya tenés, y encaja
mejor con la decisión de usar Cowork como interfaz: la derivación de próximos pasos es
juicio, no I/O, así que ya iba a necesitar el modelo de todos modos. Lo que se pierde es
que depende de la infraestructura de routines en vez de un cron propio.

Si elegís A, los pasos son: Granola → Settings → Connectors → API keys → crear una
(empieza con `grn_`). Si la opción no aparece, el plan no la habilita todavía.

## Decisiones que necesitan tu ojo

### 4. Dominio de `ALLOWED_SIGN_IN`

Está en `"fidi.money,fidi.cl"` porque tu mail de trabajo es `@fidi.money` pero el plan
hablaba de `fidi.cl`. **Es el modelo de autorización completo**: si sobra uno, sacarlo.

### 5. Cuál GTM Consorcio Targets

Hay dos databases con ese nombre en Notion, con data sources distintos. Mirar cuál vale
antes de la fase 3. El extract baja las dos igual.

### 6. Notion: marcar obsoletas las versiones viejas

Para que nadie las lea como vigentes:

- La página **📈 Sales Forecast** (31-jul): rampa lineal a 10 meses, cliff en el tramo 5
- La `Guia_Revenue_Model_Fidi.docx` en Drive (8-ago) describe el modelo **v3 anterior**,
  con tarifa marginal y ramp lineal

La fuente única es `docs/forecast-model.md` en este repo.

### 7. Token de integración de Notion

Para la fase 3. Crear una integración interna y compartirle las 8 databases del
teamspace. `NOTION_TOKEN` va **solo en `.env` local, nunca en Vercel**: la extracción
corre una vez desde tu máquina.

## Para producción, más adelante

### 8. Google OAuth

**No hace falta para desarrollar.** Para entrar localmente:

```bash
cd ~/dev/fidi-crm/apps/api
bun run dev:session ezequiel@fidi.money
# devuelve crm.session_token=... para pegar en el browser
```

Sí hace falta para: **entrar en producción**, y **leer Gmail y Calendar** en la fase 8,
que usa el mismo cliente. Cuando llegue el momento:

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create credentials → OAuth client ID → Web application
3. Authorized redirect URI: `https://<API_URL>/api/auth/callback/google`
4. Copiar a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`

Mientras tanto `.env` tiene placeholders marcados, que alcanzan para que la suite pase
(`auth.e2e.spec.ts` asume que Google está configurado).
