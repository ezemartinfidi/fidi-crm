#!/usr/bin/env bash
#
# Instala las dependencias del monorepo. Lo invoca el hook SessionStart de
# .claude/settings.json, asi que corre al abrir o reanudar cualquier sesion de
# Claude Code, local o en la nube.
#
# Nunca falla la sesion: siempre sale 0. Si bun install no funciona, avisa por
# systemMessage y deja que la sesion arranque igual, porque un hook que corta
# el arranque es peor que una dependencia faltante.
#
# Corre siempre, no solo cuando falta node_modules: es la unica forma de que un
# branch que agrega una dependencia quede instalado. Con el cache tibio tarda
# ~2,5s.
#
# Ojo con las sesiones de nube: todo el trafico sale por un proxy de seguridad y
# bun es un caso conocido de incompatibilidad para bajar paquetes. Si falla ahi,
# la salida hay que resolverla en el setup script del entorno, no aca.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-"$(dirname "$0")/.."}" || exit 0

warn() {
	# systemMessage es como un hook le habla al usuario. Una sola linea de JSON.
	printf '{"systemMessage":"%s"}\n' "$1"
	exit 0
}

if ! command -v bun >/dev/null 2>&1; then
	warn "No hay bun en el PATH, no instale dependencias. Instalalo con: curl -fsSL https://bun.sh/install | bash"
fi

if ! bun install --silent; then
	warn "bun install fallo. Si esto es una sesion de nube puede ser el proxy de seguridad (bun tiene incompatibilidades conocidas). Corre bun install a mano para ver el error."
fi

exit 0
