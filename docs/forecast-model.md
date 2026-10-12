# Modelo de forecast de Fidi — v3

**Esta es la fuente única.** Deriva del bloque JSON "Parámetros del script" de la página
📋 Supuestos, reglas y parámetros de Notion, editado el 12-ago-2026.

Quedan **obsoletas** y no deben usarse:

- La página 📈 Sales Forecast (31-jul-2026): rampa lineal a 10 meses, cliff en el tramo 5,
  costo variable por escalones de 91,4 CLP.
- La `Guia_Revenue_Model_Fidi.docx` (8-ago-2026), que describe el modelo **v3 anterior**:
  tarifa marginal y ramp lineal.

v3 gana porque las tres diferencias con julio son correcciones fechadas y con causa:

| Corrección | Fecha | Quién | Por qué |
|---|---|---|---|
| TPM anual 4,75% → **4,5%** | 12-ago-26 | Ezequiel | Actualización de la tasa |
| Tramo 5 de rev share: 0% → **35%** | 12-ago-26 | Pancho | No hay cliff; se mantiene el último tramo |
| Tramo 5 de rev share: **eliminado** | 12-oct-26 | Ezequiel | No existe. El tramo 4 (> 20.000 M, 35%) es el último y es abierto |
| Costo variable: escalones → **30% del revenue variable** | 11-ago-26 | Pancho | La regla vieja, a más de 100k cuentas, daba un costo por cuenta mayor que la tarifa (61 → 46 CLP) y **márgenes negativos**. Detectado en la auditoría del Master P&L Ago-26 |

**Criterio de aceptación:** el motor reproduce `Fidi_Revenue_Model_v4_Notion.xlsx`.
Leer antes la sección de hallazgos al final: queda **un** parámetro en el que ese Excel y
Notion difieren.

---

## Parámetros globales

| Parámetro | Valor |
|---|---|
| Moneda | CLP |
| FX CLP/USD | 950 |
| TPM anual | 4,5% |
| Mes 1 | 2026-08 |
| Horizonte | 29 meses (Ago-26 → Dic-28) |
| Método de tarifa activo | `volumen` |

## Tarifa por cuenta

`rate = round(950 × factor)` según el total de **Cuentas Régimen**.

| Cuentas (hasta) | Factor | CLP/cuenta |
|---|---|---|
| 500 | 0,80 | 760 |
| 1.000 | 0,65 | 618 |
| 2.500 | 0,40 | 380 |
| 5.000 | 0,20 | 190 |
| 10.000 | 0,125 | 119 |
| 25.000 | 0,112 | 106 |
| 50.000 | 0,096 | 91 |
| 100.000 | 0,080 | 76 |
| 250.000 | 0,064 | 61 |
| +250.000 | 0,048 | 46 |

Dos métodos, ambos implementados (D10):

- **`volumen`** (activo): el total cae en una banda y **ese único rate aplica a todas**
  las cuentas. 10.000 cuentas → 119 CLP × 10.000.
- **`marginal`**: escalonado como impuestos marginales, las primeras cuentas de cada
  tramo a su rate y se suman. Da un promedio estrictamente mayor.

## Revenue share sobre float

Solo en **Cuentas Virtuales**. En Infraestructura y FDE es 0.

Sobre el Saldo Promedio Ponderado consolidado. **No escalonado**: la tasa del tramo
aplica al total. Umbral mínimo 300 M. Año de 360 días.

```
rev_share_mes = SPP × (TPM / 12) × pct_tramo
```

| Tramo | SPP (CLP) | Tasa |
|---|---|---|
| 1 | 300 M – 2.000 M | 20% TPM |
| 2 | 2.000 M – 5.000 M | 25% TPM |
| 3 | 5.000 M – 20.000 M | 30% TPM |
| 4 | > 20.000 M | 35% TPM, **abierto** |

No hay tramo 5. El 0% que el Excel v4 pone arriba de 40.000 M no existe (Ezequiel,
12-oct-26): el último tramo no tiene techo y no hay cliff.

## Ramps

Arrancan en el **go-live**, nunca antes. `Meses de Ramp` acota la duración.

**Cuentas Virtuales — saldo vista:** tope `Saldo Vista Max (Régimen)`.
Meses 1, 2 y 3: 5% del tope cada uno. Mes 4 en adelante: anterior × **1,145**
compuesto, hasta el tope.

**Cuentas Virtuales — cantidad de cuentas:** tope `Cuentas Régimen`.
Meses 1, 2 y 3: 5% del tope. Mes 4 en adelante: anterior × **1,68** compuesto.

**Infraestructura — cuentas:** con `Meses de Ramp`, lineal `m/Ramp`. Sin `Meses de
Ramp`, lineal a 12 meses: 5/5/5 y después +10pp hasta 100%. Infra no tiene float.

## Timing

Todo se ancla en **Expected Close** (`Deal.expectedCloseDate`).

- **Setup:** cuotas iguales `Setup Fee / Meses de Setup`, desde el mes siguiente al
  Close. En CV el Setup Fee es **opcional**: sin él no hay cuotas.
- **Meses de Setup:** default **2** en Cuentas Virtuales si está vacío.
- **Go-live** = `Close + Meses de Setup + 1`.
- **Fin Contrato:** si tiene fecha, el recurrente (mínimo, variable por cuenta y float)
  se factura **hasta ese mes inclusive** y es 0 desde el siguiente. Los setup fees no
  se ven afectados.

## Facturación mensual — criterio mínimo-floor

El **Mínimo Mensual se factura completo desde el go-live**. Solo la porción variable
rampa.

```
recurrente[m] =
  0                                    si m < go_live
  Aditivo  → minimo + var × rampa[m]
  Piso     → max(minimo, var × rampa[m])
```

Rampar también el mínimo es el error que esta regla corrige.

## Matriz producto × componente

| Producto | setup | mínimo | por cuenta | float | mrr fijo | modo | Línea |
|---|---|---|---|---|---|---|---|
| Core de Cuentas | ✓ | ✓ | ✓ | | ✓ | suma al mínimo | Infraestructura |
| Program Manager | ✓ | ✓ | ✓ | | ✓ | suma al mínimo | Infraestructura |
| BaaS | ✓ | ✓ | ✓ | | ✓ | suma al mínimo | Infraestructura |
| Cuentas Virtuales | ✓ | ✓ | ✓ | ✓ | ✓ | max(mínimo, por cuenta) | Cuentas Virtuales |
| Movimientos de Dinero | ✓ | ✓ | | | ✓ | suma al mínimo | Infraestructura |
| Forward Deployed Engineers | ✓ | | | | ✓ | suma al mínimo | FDE |

La **línea de revenue es una columna de `Product`**, no una regla de string matching
sobre el nombre. El JSON v3 la definía como "Producto contiene 'Cuentas Virtuales'" y
"el resto", que se rompe al renombrar un producto.

## Costos y márgenes

**Costo variable** (D12): el revenue variable por cuenta opera con **70% de margen
bruto**, o sea `costo = 0,30 × revenue_variable_por_cuenta`. Aplica a todo producto que
cobra por cuenta (CV e Infraestructura).

| Componente | Margen bruto |
|---|---|
| Infra recurrente | 65% |
| Setup | 40% |
| Forward Deployed Engineers | 40% |
| CV fee (componente por cuenta) | **70%** ⚠ placeholder (ver hallazgo 3) |
| Float | 95% ⚠ placeholder |

El **OPEX fijo** (~65 M/mes) es una línea de breakeven aparte y **no se prorratea por
deal**.

## Escenarios

Acumulativos: cada uno incluye a los anteriores.

| Escenario | Agrega |
|---|---|
| 1. Live | `Status = Won` |
| 2. Commit | `Forecast Category = Commit` |
| 3. Best Case | `Forecast Category = Best Case` |
| 4. Qualified | `Forecast Category = Pipeline` **o sin categoría** |

**Excluidos siempre:** `Forecast Category = Omitir`, `Status = Lost`, `Status = Stand By`,
y todo deal **sin Expected Close**.

**Regla anti doble conteo:** si `Status = Won`, el deal es Live y se ignora su Forecast
Category.

Los escenarios son **categóricos y no usan probabilidades**. Las probabilidades por
etapa son una segunda vista (pipeline ponderado) y se mantienen separadas para que
nadie descuente dos veces.

| Etapa | Probabilidad |
|---|---|
| Lead | 10% |
| Qualified | 20% |
| Discovery | 35% |
| Proposal | 55% |
| Negotiation | 75% |
| Won | 100% |
| Lost / Stand By | 0% |

## Bookings vs facturación reconocida

Dos métricas distintas, las dos se mantienen, **nunca en la misma serie de un gráfico**.

- **Bookings:** el MRR de régimen completo, reconocido en el mes del Expected Close.
- **Facturación reconocida:** el forecast real, mínimo más rampa desde el go-live.

## Reglas de implementación

- El motor es **puro**: sin I/O, sin `Date.now()`, sin Prisma. `asOf` y `mes1` son
  argumentos. Es lo que lo hace testeable y lo que permite reproducir un forecast viejo.
- **`decimal.js`, no `number`.** Hay `round()` explícitos, acantilados por tramo y
  multiplicaciones encadenadas de 29 meses; el punto flotante desvía más allá del 0,2%
  de tolerancia.
- **El motor nunca toca `baseAmount`, `fxRate` ni `ExchangeRate`.** Son el otro sistema
  de conversión, el del CRM, que congela la tasa al escribir. El `fxClpUsd` de los
  parámetros es solo para mostrar USD en la pantalla de forecast.
- `usarPctActivas` está implementado pero **arranca apagado** (D9).
- `mrrFijoClp` y `mrrFijoMeses` existen en `DealForecastInput` (D8, ver hallazgo 4).

---

# ⚠ Hallazgos posteriores

Al buscar el Excel apareció material que no estaba disponible cuando se congeló esta
especificación. Los hallazgos 1 (parcial) y 3 ya están resueltos y aplicados al código;
el resto sigue pendiente.

## El archivo existe, con otro nombre

Notion cita `Fidi_Revenue_Model_Ago2026`. El archivo real es
**`Fidi_Revenue_Model_v4_Notion.xlsx`** (Drive, `Finanzas / Financials Agosto-Claude`,
id `1ghJrXgyrCfPLLYvpya6ic51ZY-zoHqKl`, 11-ago-2026). Hay además una
`Guia_Revenue_Model_Fidi.docx` (8-ago) que describe la versión **anterior**, v3.

Buena noticia: el Excel v4 se declara *"Espejo del bloque 'Parámetros del script' de
Notion"*, lo que confirma D1. Los tramos de tarifa, el método `volumen`,
`usar_pct_activas = false`, los ramps de CV y el mapeo de escenarios coinciden exacto.

Los fixtures están en `packages/forecast/test/fixtures/`.

## 1. El Excel no se reproduce con los parámetros de producción

Notion se editó el 12-ago, un día después del Excel, con dos cambios que el Excel no
tiene:

| | Excel v4 (11-ago) | Notion (12-ago) | Resuelto |
|---|---|---|---|
| TPM anual | 4,75% | 4,5% | Pendiente |
| Rev share tramo 5 | 0% (cliff) | 35% (sin cliff) | ✅ **No existe el tramo 5** |

**El tramo 5 está cerrado** (Ezequiel, 12-oct-26): no es que valga 0% ni 35%, es que no
existe. El último tramo es `20.000 M → ∞ al 35%`, abierto. En el código esto se modelaba
antes como dos filas contiguas de 35%, que daba el mismo número pero dejaba viva la
pregunta; ahora es una sola fila y `revshare.spec.ts` tiene un test que falla si alguien
reintroduce el cliff leyendo el Excel.

**Queda la TPM.** Sigue siendo la única diferencia real entre el Excel y producción, así
que EVAL-F1 va a necesitar correr con `tpmAnual: 4,75%` para reproducir el Excel, y
producción queda en 4,5%. Es un override de un escalar en el parameter set, no un
segundo set completo.

## 2. La "tercera versión contradictoria" del ramp no existía

El riesgo 1 del plan decía que había tres versiones en conflicto. El Excel v4 lo aclara:

> *"Infra sin Meses de Ramp: lineal 12m (5/5/5, luego +10pp hasta 100%). Con Meses de
> Ramp: lineal m/Ramp."*

La rampa lineal de 12 meses es el ramp de **Infraestructura**, no una versión vieja del
de CV. Coexisten. **`rampLineal()` está incompleto:** hoy devuelve el tope cuando no hay
Meses de Ramp, y debería aplicar 5/5/5 y después +10pp.

## 3. D12 era un conflicto falso, y el margen sigue sin definir ✅ resuelto como placeholder

El Excel v4 tiene las dos cosas, en secciones distintas: `F · MÁRGENES BRUTOS` da CV
fee 65% y Float 95%; `E · COSTO VARIABLE POR ESCALONES` da 91,4 CLP/cuenta ×0,9 cada
400k, etiquetado *"informativo, para el P&L"*.

La guía del 8-ago dice que los márgenes de CV (65%) y Float (95%) **son placeholders**:
*"definirlos antes de montar el P&L"*.

**Decisión (Ezequiel, 12-oct-26): quedan como placeholders.** No se cierra D12. El
código usa `cvFee: 0.70` porque es el complemento de `costoPctRevenueVariable: 0.30` y
por lo tanto el único valor que hace cerrar el componente, pero está marcado como
placeholder en `params.ts` y **no hay ningún test que fije el 0,70**. Lo que sí se
testea es la relación: `costoPctRevenueVariable + cvFee = 1`. Cuando llegue el valor
real, eso es lo que tiene que seguir cumpliéndose.

Consecuencia para los evals: **EVAL-F3 cambia de sentido.** Estaba especificado como
"falla si alguien reintroduce 0,65"; eso ya no aplica, porque 0,65 es tan placeholder
como 0,70. Pasa a verificar la relación de coherencia, no el número.

## 4. D8 tiene respuesta, y no es "vacío"

`mrr_fijo` es **SSPP = Servicios Profesionales**:

> *"MRR fijo / SSPP: monto mensual por una duración definida (ej.: Hites Core de
> Crédito $15K × 10 meses). Si la duración queda vacía, es permanente."*

Los campos son correctos, pero no van a estar vacíos: hay al menos un deal real
usándolos. Y "si la duración queda vacía, es permanente" falta implementar.

## 5. Faltan productos en el catálogo

El Excel y la guía nombran **Core de Crédito** (Afex Wallet lo usa) y **Servicios
Profesionales**. El catálogo sembrado tiene los 6 de la matriz de Notion. FDE y
Servicios Profesionales parecen ser lo mismo; Core de Crédito falta.

## 6. Cifras de referencia

Excel v4, escenario Commit, MRR total CLP: Ago-26 $53,33 M · Dic-26 $44,17 M ·
Dic-27 $130,61 M · Dic-28 $153,56 M.

La guía del 8-ago cita cifras muy distintas (MRR Ago-26 ≈ USD 70,7K) porque describe
v3, que usaba tarifa **marginal** y ramp **lineal**. No mezclar.
