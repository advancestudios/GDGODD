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
| `/update hardest` | Miembros | Primera vez: vincula la cuenta de GD con un código en los comentarios del perfil. Después: actualiza nivel, peor fallo y video |
| `/gd cuenta [usuario]` | Miembros (con `usuario`, solo staff) | Muestra la cuenta de GD vinculada |
| `/gd desvincular [usuario]` | Miembros (con `usuario`, solo staff) | Desvincula la cuenta y quita la entrada del Hardest |

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
