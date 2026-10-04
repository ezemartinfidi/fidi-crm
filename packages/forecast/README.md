# @crm/forecast

El motor de revenue de Fidi. La especificación congelada está en
[`docs/forecast-model.md`](../../docs/forecast-model.md).

## Reglas que no se negocian

**Es puro.** Sin I/O, sin `Date.now()`, sin Prisma. `asOf` y `mes1` son argumentos.
Es lo que lo hace testeable y lo que permite reproducir un forecast de hace dos años.

**Usa `decimal.js`, nunca `number`.** El modelo tiene `round()` explícitos, acantilados
por tramo y multiplicaciones encadenadas de 29 meses. El punto flotante desvía más allá
del 0,2% de tolerancia contra el Excel, y encontrar por qué cuesta días.

**Nunca toca `baseAmount`, `fxRate` ni `ExchangeRate`.** Ese es el otro sistema de
conversión, el del CRM, que congela la tasa al escribir. El `fxClpUsd` de los parámetros
existe solo para mostrar USD en pantalla.

**`ENGINE_VERSION` se bumpea ante cualquier cambio de comportamiento.** Un
`ForecastRun` guarda con qué versión y con qué checksum de parámetros se produjo.
