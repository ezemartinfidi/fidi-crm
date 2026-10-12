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
- ~~**Conectores MCP custom en el plan de Claude**~~ — confirmado por Ezequiel.
- ~~**Tramo 5 del rev share**~~ — no existe. El tramo 4 (> 20.000 M al 35%) es el último
  y es abierto.
- ~~**Margen bruto de Cuentas Virtuales**~~ — queda como placeholder, a propósito. No
  hay test que fije el 0,70; se testea la relación con el costo variable.

## Bloqueantes

### 1. El entorno de nube en claude.ai/code

Es lo único que falta para que puedas trabajar desde el teléfono. **No lo puedo crear yo:
los entornos de nube se configuran solo por UI, no hay comando ni API.** Y aunque la
hubiera, el `DATABASE_URL` no lo puedo leer: Neon escribe sus variables en Vercel como
`sensitive`, que es de solo escritura por diseño.

En claude.ai/code → selector de entorno → nuevo entorno sobre `ezemartinfidi/fidi-crm`:

**Network access: `Custom`**, con *"Also include default list of common package
managers"* **tildado**, y el host de Neon en la lista:

```text
ep-<tu-endpoint>.sa-east-1.aws.neon.tech
```

El default es `Trusted`, que solo alcanza registries de paquetes y GitHub. **Neon no está
en esa lista**, así que sin este paso la app no puede hablar con la base.

**Setup script:** pegar el contenido de `scripts/cloud-setup.sh` de este repo. Instala
Node 24, que es lo único que la imagen base no trae (viene con 20, 21 y 22). El resultado
queda en un snapshot cacheado, así que corre una sola vez y no en cada sesión.

**Environment variables:** las mismas que ya están en Vercel. `DATABASE_URL` y
`DIRECT_DATABASE_URL` tienen que salir de Neon, no de `vercel env pull`, que las devuelve
vacías por ser `sensitive`.

Las dependencias **no** van acá: las instala `scripts/install-deps.sh` por el hook
`SessionStart` de `.claude/settings.json`, que ya está commiteado y corre igual en local
y en la nube.

> **Hay un riesgo conocido en este paso.** La documentación dice que todo el tráfico
> saliente pasa por un proxy de seguridad y que **bun es un caso conocido de
> incompatibilidad para bajar paquetes**. Si `bun install` falla en la primera sesión de
> nube, el hook te lo va a avisar con el error exacto en vez de romper la sesión. Avisame
> con ese error y lo resolvemos; no lo puedo verificar sin una sesión de nube real.

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
