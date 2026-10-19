/**
 * Busca un nivel de Geometry Dash por su ID y devuelve su nombre y su Top.
 *
 * Orden de consulta:
 *  1) Pointercrate (Demon List): nombre y posición (Top). Solo tiene los niveles que están en la lista.
 *  2) Servidores oficiales de GD (los mismos que usa el juego): tienen TODOS los niveles subidos.
 *     Dan el nombre; el Top queda vacío porque no es un nivel de la lista. Si responden "-1",
 *     el nivel de verdad no existe.
 *  3) GDBrowser (último respaldo): su propio "-1" NO prueba que el nivel no exista (suele fallar
 *     por sus límites), así que solo se usa para encontrar el nombre.
 *
 * Optimizaciones para que no falle seguido:
 *  - Caché en memoria (los niveles repetidos no vuelven a consultar a nadie).
 *  - Consultas iguales en simultáneo comparten una sola petición.
 *  - Cada consulta se reintenta una vez si hay corte de red, timeout o servidor saturado.
 *
 * lookupLevel() devuelve:
 *  - { name, top, source }  -> nivel encontrado (top puede ser null si no está en la lista)
 *  - null                   -> los servidores oficiales confirmaron que el nivel no existe
 *  - lanza LookupError      -> no se pudo confirmar nada (reintentar luego)
 */

const POINTERCRATE_URL = 'https://pointercrate.com/api/v2/demons/listed/';
const GD_SERVER_URL = 'http://www.boomlings.com/database/getGJLevels21.php';
const GDBROWSER_URL = 'https://gdbrowser.com/api/level/';
// Clave pública que usa el juego para sus búsquedas (no es un secreto)
const GD_SECRET = 'Wmfd2893gb7';

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

/** Petición con timeout y un reintento. Devuelve { status, body } (el body siempre como texto). */
async function request(url, { method = 'GET', body, headers = {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { Accept: 'application/json', 'User-Agent': 'bot-gd-urugodd (Discord bot)', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();

      if (RETRY_STATUSES.has(res.status) && attempt < ATTEMPTS) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return { status: res.status, body: text };
      }
    } catch (err) {
      lastError = err; // timeout o corte de red
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw lastError;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null; // GDBrowser responde "-1" u otro texto cuando no encuentra el nivel
  }
}

/** @returns {Promise<{name:string, top:number|null, source:string}|null>} null = no está en la lista */
async function fromPointercrate(levelId) {
  const { status, body } = await request(`${POINTERCRATE_URL}?level_id=${levelId}`);
  if (status < 200 || status >= 300) throw new Error(`Pointercrate respondió HTTP ${status}`);

  const json = parseJson(body);
  const demon = Array.isArray(json) ? json[0] : null;
  if (!demon || !demon.name) return null;

  return {
    name: String(demon.name),
    top: Number.isInteger(demon.position) && demon.position > 0 ? demon.position : null,
    source: 'pointercrate',
  };
}

/**
 * Convierte la respuesta de getGJLevels21 ("niveles#creadores#canciones#...") en un objeto del primer nivel.
 * Cada nivel viene como "clave:valor:clave:valor" (clave 1 = ID, 2 = nombre).
 */
function parseGdLevel(raw) {
  const levelsPart = raw.split('#')[0];
  const first = levelsPart.split('|')[0];
  const parts = first.split(':');
  const fields = {};
  for (let i = 0; i + 1 < parts.length; i += 2) fields[parts[i]] = parts[i + 1];
  return fields;
}

/**
 * @returns {Promise<{name:string, top:null, source:string}|null>}
 *   null = los servidores de GD confirmaron que el nivel NO existe ("-1")
 */
async function fromGdServers(levelId) {
  const { status, body } = await request(GD_SERVER_URL, {
    method: 'POST',
    // Los servidores de GD rechazan peticiones con User-Agent, por eso va vacío
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': '' },
    body: new URLSearchParams({ secret: GD_SECRET, type: '0', str: String(levelId) }).toString(),
  });

  const text = body.trim();
  if (text === '-1') return null; // búsqueda sin resultados: el nivel no existe

  // Cualquier otra cosa que no sea el formato esperado (HTML de bloqueo, "error code: 1005", etc.) es un fallo
  if (status < 200 || status >= 300 || !text.includes('#')) {
    throw new Error(`Servidores de GD: respuesta inesperada (HTTP ${status}) "${text.slice(0, 40)}"`);
  }

  const fields = parseGdLevel(text);
  if (fields['1'] !== String(levelId) || !fields['2']) {
    throw new Error('Servidores de GD: la respuesta no corresponde a ese ID');
  }
  return { name: fields['2'], top: null, source: 'gd-servers' };
}

/** @returns {Promise<{name:string, top:number|null, source:string}|null>} null = GDBrowser no lo encontró (no concluyente) */
async function fromGdBrowser(levelId) {
  const { status, body } = await request(`${GDBROWSER_URL}${levelId}`);
  const json = parseJson(body);

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

async function search(levelId) {
  // 1) Demon List (Top + nombre)
  try {
    const listed = await fromPointercrate(levelId);
    if (listed) return listed;
  } catch (err) {
    console.warn('[levelLookup] Pointercrate falló:', err.message);
  }

  // 2) Servidores oficiales de GD (el único "no existe" que se considera definitivo)
  try {
    return await fromGdServers(levelId);
  } catch (err) {
    console.warn('[levelLookup] Servidores de GD fallaron:', err.message);
  }

  // 3) GDBrowser como último respaldo
  try {
    const found = await fromGdBrowser(levelId);
    if (found) return found;
  } catch (err) {
    console.warn('[levelLookup] GDBrowser falló:', err.message);
  }

  throw new LookupError('No pude confirmar ese nivel en ninguna fuente.');
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

module.exports = {
  lookupLevel,
  clearCache,
  LookupError,
  // Para el script de diagnóstico y las pruebas
  sources: { fromPointercrate, fromGdServers, fromGdBrowser },
  _internals: { request, parseGdLevel },
};
