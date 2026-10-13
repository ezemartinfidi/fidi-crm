#!/usr/bin/env bash
#
# Setup script del entorno de nube. NO lo corre nadie desde el repo: hay que
# pegar su contenido en el campo "Setup script" del entorno, en claude.ai/code.
# Vive aca para que quede versionado y revisable como cualquier otro codigo.
#
# Hace una sola cosa, la unica que un hook SessionStart no puede hacer:
# aprovisionar la VM con Node 24. La imagen base trae 20, 21 y 22 (en
# /opt/node20, /opt/node21 y /opt/node22, con 22 en el PATH), y eve no compila
# con menos de 24.
#
# Las dependencias del monorepo NO se instalan aca a proposito: no esta
# garantizado que el repo ya este clonado cuando corre el setup script. De eso
# se encarga scripts/install-deps.sh via el hook SessionStart, que si recibe la
# ruta del repo en CLAUDE_PROJECT_DIR.
#
# Restricciones del formato (son de la plataforma, no nuestras):
#   - Tiene que salir 0. Si sale distinto de 0, la sesion no arranca.
#   - Tiene que terminar en menos de ~5 minutos, o el entorno no se cachea.
#   - Solo alcanza dominios de la allowlist. nodejs.org esta en la lista
#     Trusted, por eso bajamos el tarball oficial en vez de usar NodeSource,
#     que no esta permitido.
set -u

NODE_VERSION=v24.13.1
NODE_DIR=/opt/node24

if [ ! -x "$NODE_DIR/bin/node" ]; then
	if curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node24.tar.xz &&
		mkdir -p "$NODE_DIR" &&
		tar -xJf /tmp/node24.tar.xz -C "$NODE_DIR" --strip-components=1; then
		rm -f /tmp/node24.tar.xz
	else
		echo "ADVERTENCIA: no pude instalar Node ${NODE_VERSION}. eve no va a compilar en esta sesion."
	fi
fi

# Que gane sobre el /opt/node22 de la imagen base. Los symlinks cubren los
# shells que no son de login, que es como corren los hooks; el profile.d cubre
# el resto.
if [ -x "$NODE_DIR/bin/node" ]; then
	ln -sf "$NODE_DIR/bin/node" /usr/local/bin/node
	ln -sf "$NODE_DIR/bin/npm" /usr/local/bin/npm
	ln -sf "$NODE_DIR/bin/npx" /usr/local/bin/npx
	printf 'export PATH=%s/bin:$PATH\n' "$NODE_DIR" >/etc/profile.d/node24.sh
	echo "Node $("$NODE_DIR/bin/node" --version) listo en $NODE_DIR"
fi

exit 0
