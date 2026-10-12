# Trabajar solo en la nube

Cómo queda este proyecto para que no haga falta ninguna sesión local, ni la máquina de
nadie, para seguir trabajándolo.

La regla que ordena todo: **una sesión de nube arranca de un clone limpio del repo.** Lo
que está commiteado, está. Lo que vive en tu `~/.claude/` o en tu disco, no existe. Así
que "llevarlo a la nube" es, casi entero, mover configuración al repo.

## Tres cosas distintas que suenan igual

| Qué | Dónde corre | Estado |
|---|---|---|
| **El producto**, o sea el CRM | Vercel + Neon | ✅ Ya es así |
| **El desarrollo**, escribir código y revisar | Sesiones de nube desde el teléfono o el browser | 🟡 Falta crear el entorno |
| **El trabajo recurrente**, digests y derivación de tareas | Routines (agentes programados) | ⬜ Fase 8 y 9 |

Las tres son independientes. El producto ya no depende de ninguna máquina. Lo que todavía
depende de una sesión local es el desarrollo, y es lo que resuelve este documento.

## Lo que ya viaja, porque está en el repo

- `CLAUDE.md` y todo lo que importa con `@`, incluido `docs/fidi/contexto.md`
- `.claude/settings.json`: el hook `SessionStart` que instala dependencias
- `scripts/install-deps.sh` y `scripts/cloud-setup.sh`
- `.claude/rules/`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/` si existieran
- `.mcp.json` si existiera, en sesiones de un solo repo
- Toda la documentación de `docs/fidi/`, que es el mecanismo de traspaso real: una sesión
  de nube no hereda la conversación, hereda estos archivos

## Lo que NO viaja, y qué se hizo con cada cosa

| Qué | Por qué no viaja | Resuelto |
|---|---|---|
| `~/.claude/CLAUDE.md` (regla de guiones, routing de skills) | Vive en tu máquina | ✅ La regla de estilo se copió al `CLAUDE.md` del repo |
| Las skills de gstack (`/review`, `/ship`, `/qa`...) | Viven en `~/.claude/skills/` | ⬜ Pendiente: ver abajo |
| Plugins y marketplaces | Una sesión de nube no instala plugins, ni los que declare el repo | Sin solución; no depender de ellos |
| Auth del CLI de Vercel | Vive en tu keychain | ⬜ Usar el conector MCP de Vercel, o un `VERCEL_TOKEN` |
| Postgres local en Docker | No hay Docker nuestro en la VM | ✅ Neon, o el PostgreSQL 16 de la VM para tests |
| Login interactivo (SSO, OAuth de browser) | No hay browser en la sesión | Sin solución, por diseño |

### Las skills de gstack

Es el hueco más grande que queda. Si querés `/review` o `/ship` en la nube, hay que
copiarlas a `.claude/skills/` del repo y commitearlas. Son de un tercero y viven en tu
`~/.claude/skills/`, así que es una decisión tuya si entran al repo del CRM.

Alternativa más limpia: no depender de ellas en la nube, y usarlas solo cuando trabajes
local. El flujo de nube no las necesita para escribir código y correr tests.

## Los conectores MCP sí funcionan, y no hay nada que commitear

Buena noticia, y es la que hace viable todo esto. Los conectores de claude.ai (Notion,
Granola, Vercel, Slack) **funcionan en sesiones de nube y en routines**, y su tráfico no
pasa por la allowlist de red porque va por los servidores de Anthropic.

No se configuran en el repo: se habilitan al lanzar la sesión o la routine. O sea que el
acceso a Notion y Granola que hoy tengo acá, lo tengo igual allá, sin mover una
credencial.

Esto importa para la fase 3 y la fase 8: el extract de Notion y la lectura de Granola no
necesitan tokens en ninguna variable de entorno.

## Secretos: la parte incómoda

La documentación es explícita: **cualquiera que use el entorno puede leer sus variables
de entorno**, y el propio diálogo advierte contra poner secretos ahí.

Hay un mecanismo seguro, las **API credentials**: guardás la clave en el entorno, el
proxy de Anthropic la agrega a las requests de los hosts que listes, y la clave nunca
llega a Claude ni a las variables de entorno. Requiere plan Pro o Max y rol de admin.

**Pero no sirve para la base de datos.** Las API credentials funcionan agregando la clave
a requests HTTP. Prisma abre una conexión TCP a Postgres, no manda un header. Así que
`DATABASE_URL` tiene que ser una variable de entorno, y por lo tanto legible.

**La mitigación es la que ya estaba planeada: el entorno de nube apunta a un branch `dev`
de Neon, nunca al de producción.** Para eso existen los branches de Neon. Si esa
credencial se filtra, se filtró una base de desarrollo que se puede recrear en un minuto.

Regla dura, que ya está en `contexto.md`: **el `DATABASE_URL` de un entorno de nube nunca
apunta al branch de producción.**

## Lo que nunca se va a poder automatizar

Son flujos de OAuth por UI. No hay API:

- Crear o editar el entorno de nube
- Instalar la app de GitHub de Claude
- Crear el OAuth client de Google
- Crear API keys en servicios de terceros

Son de una sola vez. Después de eso, el proyecto no necesita tu máquina.

## El estado final al que apunta esto

Cuando el entorno esté creado:

1. Abrís claude.ai/code o la app del teléfono, elegís el entorno, describís la tarea
2. La sesión clona el repo, instala Node 24 desde el snapshot cacheado, corre
   `bun install` por el hook, y arranca con el contexto de `docs/fidi/`
3. Los conectores de Notion y Granola están disponibles si los habilitás
4. El trabajo termina en un commit y un push, y Vercel deploya

Esta sesión local deja de ser necesaria. Lo único que sigue siendo tuyo y de nadie más es
tomar las decisiones de negocio y crear credenciales en servicios de terceros.
