/**
 * Busca un nivel de Geometry Dash por su ID y devuelve su nombre y su Top.
 *
 * Orden de consulta:
 *  1) Pointercrate (Demon List oficial): da el nombre y la posición (Top).
 *  2) GDBrowser (respaldo): si el nivel no está en la Demon List, o Pointercrate falla,
 *     se usa para sacar el nombre (y el Top si GDBrowser lo trae).
 *
 * Optimizaciones para que no falle seguido:
 *  - Caché en memoria (los niveles repetidos no vuelven a consultar a nadie).
 *  - Consultas iguales en simultáneo comparten una sola petición.
 *  - Cada consulta se reintenta una vez si hay corte de red, timeout o servidor saturado.
 *
 * lookupLevel() devuelve:
 *  - { name, top, source }  -> nivel encontrado (top puede ser null si no está en la lista)
 *  - null                   -> el nivel no existe
 *  - lanza LookupError      -> no se pudo consultar ninguna fuente (reintentar luego)
 */

const POINTERCRATE_URL = 'https://pointercrate.com/api/v2/demons/listed/';
const GDBROWSER_URL = 'https://gdbrowser.com/api/level/';

const TIMEOUT_MS = 5000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const TTL_FOUND_MS = 10 * 60 * 1000;
const TTL_MISSING_MS = 2 * 60 * 1000;

class LookupError extends Error {}

const cache = new Map(); // levelId -> { value, expires }
const inflight = new Map(); // levelId -> Promise

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'bot-gd-urugodd (Discord bot)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.text();

      if (RETRY_STATUSES.has(res.status) && attempt < ATTEMPTS) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          /* GDBrowser responde "-1" u otro texto cuando no encuentra el nivel */
        }
        return { status: res.status, json };
      }
    } catch (err) {
      lastError = err; // timeout o corte de red
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw lastError;
}

/** @returns {Promise<{name:string, top:number|null, source:string}|null>} null = no está en la lista */
async function fromPointercrate(levelId) {
  const { status, json } = await request(`${POINTERCRATE_URL}?level_id=${levelId}`);
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
  const { status, json } = await request(`${GDBROWSER_URL}${levelId}`);

  if (json && typeof json === 'object' && json.name) {
    return {
      name: String(json.name),
      top: Number.isInteger(json.demonList) && json.demonList > 0 ? json.demonList : null,
      source: 'gdbrowser',
    };
  }
  // GDBrowser responde con error / "-1" cuando el ID no existe
  if (status === 404 || json === -1 || json === '-1' || (json && typeof json === 'object')) return null;
  throw new Error(`GDBrowser respondió HTTP ${status}`);
}

async function search(levelId) {
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

async function lookupLevel(levelId) {
  const id = String(levelId);

  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (inflight.has(id)) return inflight.get(id);

  const promise = search(id)
    .then((value) => {
      cache.set(id, { value, expires: Date.now() + (value ? TTL_FOUND_MS : TTL_MISSING_MS) });
      return value;
    })
    .finally(() => inflight.delete(id));

  inflight.set(id, promise);
  return promise;
}

function clearCache() {
  cache.clear();
}

module.exports = { lookupLevel, clearCache, LookupError };
