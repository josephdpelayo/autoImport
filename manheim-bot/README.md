# Manheim Bot — Tepic

Automatiza el triage diario de las búsquedas guardadas de Manheim, aplicando las reglas
de negocio del skill `manheim-tepic` (riesgo CVT, título ausente, importación T-MEC, etc.)

## Uso

```bash
npm install          # una sola vez
node login.js        # una sola vez (y cuando la sesión expire)
node scan.js          # cada vez que quieras revisar
```

**`login.js`** abre una ventana de Chrome dedicada a este bot (perfil separado, no toca
tu Chrome normal). Inicia sesión ahí, incluye el MFA si lo pide, y **cierra la ventana**
cuando termines — la sesión queda guardada en `.chrome-profile/` (no se sube a git).

**`scan.js`** abre esa misma sesión, recorre las búsquedas guardadas listadas en
`config.js`, aplica los filtros y te dice qué carros sobreviven. Corre en modo visible
(no headless) porque Manheim bloquea el tráfico headless con un 403 de CloudFront.

Si la sesión expiró, `scan.js` te avisa y te pide correr `node login.js` de nuevo.

## Qué filtra

Ver `config.js` para los valores exactos. En resumen:

- VIN debe iniciar en 1-5 (importable bajo T-MEC / armado en Norteamérica)
- Sin luz azul / título ausente
- Sin daño estructural, sin salvage, sin canal TRA
- Drivable + motor enciende
- Odómetro, grado de condición y MMR ajustado dentro de rango (aplica siempre, aunque
  la búsqueda de Manheim no tenga esos filtros — ej. "Emmanuel 2026 2")
- Modelos con riesgo de CVT (Sentra, Versa, Altima, Rogue, Juke) excluidos, **salvo**
  que el kilometraje sea bajo (ver `blacklistMileageException`) y no haya ninguna señal
  de problema mecánico en daños/anuncios — en ese caso se permite con una nota, porque
  probablemente se vende por un choque imprevisto y no por falla de transmisión.

Además, **solo para los sobrevivientes** (para no cargar de más), el bot agrega como
notas informativas (no descartan, solo avisan): vendedor financiera subprime
(Westlake/Santander/Credit Acceptance), AutoCheck con "specific issue(s) or events
identified", y si el Condition Report muestra 0 llaves Y 0 fobs a la vez (sin ninguna
forma de arrancar el auto — duplicado + programación ~$2,500-3,500 MXN). Llantas y
refacción no se marcan: en Tepic se reemplazan baratísimo, no es señal de riesgo para
este negocio. Traer solo 1 llave o solo 1 fob es normal (autos keyless) y tampoco se
marca.

## Notificaciones y dedupe

Cada VIN que sobrevive se guarda en `seen.json`. Solo se notifica (macOS + iMessage)
para VINs que no estaban ahí antes — correr el script varias veces no te vuelve a
notificar lo mismo. Si quieres "resetear" y que todo se trate como nuevo, borra
`seen.json`.

El iMessage se manda a la dirección fija en `notify.js` (`IMESSAGE_TARGET`). Cámbiala
ahí si cambia tu Apple ID.

## Corrida automática diaria (8:00 am)

Hay un LaunchAgent instalado en
`~/Library/LaunchAgents/com.josephdpelayo.manheimbot.plist` que corre `node scan.js`
todos los días a las 8:00 am. Tiene que ser LaunchAgent (no cron) porque el script abre
una ventana de Chrome real y cron no tiene acceso a la sesión gráfica en macOS.

Requisitos para que corra: la Mac tiene que estar **encendida y con tu sesión iniciada**
a esa hora (no hace falta estar despierto tú, pero la Mac no puede estar dormida —
si es laptop y se cierra la tapa de noche, revisa Ajustes > Batería > Opciones para
permitir "despertar para actividad de red/programada", o simplemente déjala enchufada
y con la tapa abierta).

Logs de cada corrida automática: `logs/scan.log` (salida normal) y
`logs/scan-error.log` (errores).

Comandos útiles:

```bash
launchctl list | grep manheimbot                                  # ¿está cargado?
launchctl kickstart gui/$(id -u)/com.josephdpelayo.manheimbot      # correrlo ya, de prueba
launchctl bootout gui/$(id -u)/com.josephdpelayo.manheimbot        # desactivar
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.josephdpelayo.manheimbot.plist  # reactivar
```

Para cambiar la hora, edita `Hour`/`Minute` en el plist y vuelve a cargarlo
(`bootout` + `bootstrap`).

## Agregar/quitar búsquedas guardadas

Edita el arreglo `savedSearches` en `config.js` con el texto (parcial, tal cual aparece
truncado en el chip) de la búsqueda guardada en tu cuenta de Manheim.
