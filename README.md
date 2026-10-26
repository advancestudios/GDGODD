# bot-gd-urugodd

Bot de Discord para el servidor de Urugodd: muestra el embed **Server Hardest** con el top de jugadores de Geometry Dash.
Los miembros vinculan su cuenta de GD (sin contraseñas) y el bot busca solo el nombre y el Top de su nivel.

## Instalación

Requiere Node.js 18.17 o superior.

```bash
npm install
cp .env.example .env   # y rellena los valores
npm run deploy         # registra los comandos en el servidor
npm start              # inicia el bot
```

Variables del `.env`: ver [`.env.example`](.env.example).

## Comandos

| Comando | Quién | Qué hace |
| --- | --- | --- |
| `/setup embed hardest canal:#canal` | Staff (Gestionar servidor) o dueños | Envía el embed al canal y lo deja configurado para editarlo ahí |
| `/setup revision canal canal:#canal` | Staff o dueños | Activa la revisión: las actualizaciones llegan a ese canal con botones Aceptar / Rechazar |
| `/setup revision desactivar` | Staff o dueños | Desactiva la revisión: las actualizaciones se publican directo |
| `/update hardest` | Miembros | Primera vez: vincula la cuenta de GD con un código en los comentarios del perfil. Después: actualiza nivel, peor fallo y video |
| `/gd cuenta [usuario]` | Miembros (con `usuario`, solo staff) | Muestra la cuenta de GD vinculada |
| `/gd desvincular [usuario]` | Miembros (con `usuario`, solo staff) | Desvincula la cuenta y quita la entrada del Hardest |
| `/help` | Todos | Lista los comandos; el botón **Cómo Usar** explica el paso a paso y **Atrás** vuelve |

## Fuentes de niveles

Por ID, el bot consulta en orden: **Pointercrate** → **AREDL** → servidores oficiales de GD → GDBrowser. Pointercrate y AREDL son listas distintas, así que sus posiciones no son comparables entre sí.

## Revisión del staff (opcional)

Con `/setup revision canal`, cada `/update hardest` se envía a ese canal en vez de publicarse directo.
El staff (permiso **Gestionar servidor**) pulsa **Aceptar** (se guarda y se actualiza el Hardest) o **Rechazar** (pide un motivo).
En ambos casos el miembro recibe el resultado por mensaje privado. Cada miembro tiene una sola solicitud pendiente: si envía otra, reemplaza la anterior.
Sin canal de revisión el bot funciona como siempre, publicando directo.

Después de actualizar el bot hay que volver a ejecutar `npm run deploy` para registrar el comando nuevo.

## Niveles aceptados

Por defecto el Hardest solo acepta **Extreme Demon**. Para aceptar otros tipos de demon, edita `ALLOWED_DIFFICULTIES` en `src/config.js`
(`'Easy Demon'`, `'Medium Demon'`, `'Hard Demon'`, `'Insane Demon'`, `'Extreme Demon'`).
Si no se puede determinar la dificultad del nivel, se deja pasar y el staff la ve en la revisión.

## Cómo se ve el Hardest

- Cada entrada muestra la carita de la dificultad del nivel (imágenes públicas, no emojis del bot; la dirección está en `src/difficulty.js`).
- Si varios miembros tienen el mismo nivel, salen juntos en una sola entrada (`#1 - Alpha & Beta`) con el fallo y el video de cada uno.
- Los jugadores guardados antes de esta versión no tienen dificultad y se ven igual que antes, sin icono, hasta que vuelvan a usar `/update hardest`.

## Configuración visual

En `src/config.js` se cambian el tamaño del top (`TOP_SIZE`), los textos y los emojis.
Para los puestos Top 4 y Top 5, pega el emoji en `EMOJIS.top` con el formato `<:nombre:ID>`.

## Datos

Los jugadores y cuentas vinculadas se guardan en `data/hardest.json` (o en `DATA_DIR`).
Esa carpeta no se sube al repositorio; en un hosting hay que apuntar `DATA_DIR` a un disco persistente para no perder los datos.

## Diagnóstico

```bash
npm run check-level -- <ID del nivel>
npm run check-account -- "Username" [CODIGO]
```
