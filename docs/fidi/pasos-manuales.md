# Pasos manuales pendientes

Todo lo que requiere una cuenta, una tarjeta o una decisión que no puedo tomar leyendo
archivos. Ordenado por lo que bloquea antes.

## Resueltos

- ~~**Vercel Pro**~~ — hecho.
- ~~**Google OAuth para entrar localmente**~~ — no hace falta. Ver abajo.
- ~~**Encontrar el Excel del modelo**~~ — es `Fidi_Revenue_Model_v4_Notion.xlsx`,
  ya está exportado en `packages/forecast/test/fixtures/`.
- ~~**El repo en iCloud**~~ — movido a `~/dev/fidi-crm`.

## Bloqueantes

### 1. Las dos preguntas para Pancho

Son las únicas que frenan la fase 2, y ninguna se puede resolver leyendo archivos:

**El tramo 5 del rev share.** El Excel v4 (11-ago) dice 0%, un cliff, *"confirmado por
la página de Supuestos"*. Notion (12-ago) dice 35%, *"corrección Pancho, no hay cliff"*.
Con más de 40.000 M de saldo consolidado la diferencia es enorme.

**El margen bruto de Cuentas Virtuales.** La guía del 8-ago marca el 65% de CV y el 95%
de Float como **placeholders**: *"definirlos antes de montar el P&L"*. La regla del
11-ago (costo = 30% del revenue variable, o sea 70% de margen) puede ser la definición
que llegó después, o puede ser otra cosa.

### 2. Node 24 en los proyectos de Vercel

El `package.json` raíz declara `"node": ">=22"`, pero **`eve` exige >=24** y falla el
build con 22. Está fijado localmente en `.nvmrc`; en Vercel hay que seleccionar Node 24
en Settings → General → Node.js Version de cada proyecto.

## Verificaciones pendientes (fase 0.5)

### 3. Conectores MCP custom en el plan de Claude

Confirmar que el plan de Fidi permite conectores MCP custom y que las 5 personas tienen
Cowork habilitado. Si no, cambia la interfaz entera del proyecto.

### 4. API key de Granola

El endpoint está verificado: `https://public-api.granola.ai/v1/notes` existe y responde
401 con formato correcto. Falta confirmar que el plan lo permite.

- Granola → Settings → Connectors → API keys → crear una (empieza con `grn_`)
- Requiere plan **Business o Enterprise**
- Probar: `curl -H "Authorization: Bearer grn_..." https://public-api.granola.ai/v1/notes`

Si la opción no aparece, no estás en Business. La fase 8 pierde su mejor fuente de
señales y hay que decidir si Cowork hace de puente (tiene ambos conectores).

## Decisiones que necesitan tu ojo

### 5. Dominio de `ALLOWED_SIGN_IN`

Está en `"fidi.money,fidi.cl"` porque tu mail de trabajo es `@fidi.money` pero el plan
hablaba de `fidi.cl`. **Es el modelo de autorización completo**: si sobra uno, sacarlo.

### 6. Cuál GTM Consorcio Targets

Hay dos databases con ese nombre en Notion, con data sources distintos. Mirar cuál vale
antes de la fase 3. El extract baja las dos igual.

### 7. Notion: marcar obsoletas las versiones viejas

Para que nadie las lea como vigentes:

- La página **📈 Sales Forecast** (31-jul): rampa lineal a 10 meses, cliff en el tramo 5
- La `Guia_Revenue_Model_Fidi.docx` en Drive (8-ago) describe el modelo **v3 anterior**,
  con tarifa marginal y ramp lineal

La fuente única es `docs/forecast-model.md` en este repo.

### 8. Token de integración de Notion

Para la fase 3. Crear una integración interna y compartirle las 8 databases del
teamspace. `NOTION_TOKEN` va **solo en `.env` local, nunca en Vercel**: la extracción
corre una vez desde tu máquina.

## Para producción, más adelante

### 9. Google OAuth

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
