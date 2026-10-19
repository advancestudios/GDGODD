/**
 * Busca un nivel de Geometry Dash por su ID y devuelve su nombre y su Top.
 *
 * Orden de consulta:
 *  1) Pointercrate (Demon List oficial): da el nombre y la posición (Top).
 *  2) GDBrowser (respaldo): si el nivel no está en la Demon List, o Pointercrate falla,
 *     se usa solo para sacar el nombre (y el Top si GDBrowser lo trae).
 *
 * lookupLevel() devuelve:
 *  - { name, top, source }  -> nivel encontrado (top puede ser null si no está en la lista)
 *  - null                   -> el nivel no existe
 *  - lanza LookupError      -> no se pudo consultar ninguna fuente (reintentar luego)
 */

const POINTERCRATE_URL = 'https://pointercrate.com/api/v2/demons/listed/';
const GDBROWSER_URL = 'https://gdbrowser.com/api/level/';
const TIMEOUT_MS = 8000;

class LookupError extends Error {}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'bot-gd-urugodd (Discord bot)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* GDBrowser responde "-1" u otro texto cuando no encuentra el nivel */
  }
  return { status: res.status, json };
}

/** @returns {Promise<{name:string, top:number|null, source:string}|null>} null = no está en la lista */
async function fromPointercrate(levelId) {
  const { status, json } = await getJson(`${POINTERCRATE_URL}?level_id=${levelId}`);
  if (status < 200 || status >= 300) throw new Error(`Pointercrate respondió HTTP ${status}`);

  const demon = Array.isArray(json) ? json[0] : null;
  if (!demon || !demon.name) return null;

  return {
    name: String(demon.name),
    top: Number.isInteger(demon.position) && demon.position > 0 ? demon.position : null,
    source: 'pointercrate',
  };
}

/** @returns {Promise<{name:string, top:number|null, source:string}|null>} null = el nivel no existe */
async function fromGdBrowser(levelId) {
  const { status, json } = await getJson(`${GDBROWSER_URL}${levelId}`);

  // GDBrowser responde con error / "-1" cuando el ID no existe
  if (json && typeof json === 'object' && json.name) {
    return {
      name: String(json.name),
      top: Number.isInteger(json.demonList) && json.demonList > 0 ? json.demonList : null,
      source: 'gdbrowser',
    };
  }
  if (status === 404 || json === -1 || json === '-1' || (json && typeof json === 'object')) return null;
  throw new Error(`GDBrowser respondió HTTP ${status}`);
}

async function lookupLevel(levelId) {
  try {
    const pc = await fromPointercrate(levelId);
    if (pc) return pc;
  } catch (err) {
    console.warn('[levelLookup] Pointercrate falló, uso GDBrowser:', err.message);
  }

  try {
    return await fromGdBrowser(levelId);
  } catch (err) {
    console.warn('[levelLookup] GDBrowser falló:', err.message);
    throw new LookupError('No pude consultar los servicios de niveles.');
  }
}

module.exports = { lookupLevel, LookupError };
