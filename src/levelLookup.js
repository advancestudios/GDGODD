/**
 * Busca un nivel de Geometry Dash por su ID y devuelve su nombre y su Top.
 *
 * Orden de consulta:
 *  1) Pointercrate (Demon List): nombre y posición (Top). Solo tiene los niveles que están en la lista.
 *  2) AREDL (All Rated Extreme Demon List): nombre y posición para los Extreme Demons que no están
 *     en Pointercrate (la AREDL tiene muchos más).
 *  3) Servidores oficiales de GD (los mismos que usa el juego): tienen TODOS los niveles subidos.
 *     Dan el nombre; el Top queda vacío porque no es un nivel de ninguna lista. Si responden "-1",
 *     el nivel de verdad no existe.
 *  4) GDBrowser (último respaldo): su propio "-1" NO prueba que el nivel no exista (suele fallar
 *     por sus límites), así que solo se usa para encontrar el nombre.
 *
 * Optimizaciones para que no falle seguido:
 *  - Caché en memoria (los niveles repetidos no vuelven a consultar a nadie).
 *  - Consultas iguales en simultáneo comparten una sola petición.
 *  - Cada consulta se reintenta una vez si hay corte de red, timeout o servidor saturado.
 *
 * Además del nombre y el Top, devuelve la dificultad ("Extreme Demon", "Insane Demon", ...) cuando se puede
 * determinar (null si no): el Hardest la usa para aceptar solo las dificultades permitidas y para el icono.
 *
 * lookupLevel() devuelve:
 *  - { name, top, difficulty, source } -> nivel encontrado (top puede ser null si no está en la lista)
 *  - null                   -> los servidores oficiales confirmaron que el nivel no existe
 *  - lanza LookupError      -> no se pudo confirmar nada (reintentar luego)
 */

const { request, parseJson } = require('./http');

const POINTERCRATE_URL = 'https://pointercrate.com/api/v2/demons/listed/';
const AREDL_URL = 'https://api.aredl.net/v2/api/aredl/levels/';
const GD_SERVER_URL = 'http://www.boomlings.com/database/getGJLevels21.php';
const GDBROWSER_URL = 'https://gdbrowser.com/api/level/';
// Clave pública que usa el juego para sus búsquedas (no es un secreto)
const GD_SECRET = 'Wmfd2893gb7';

const TTL_FOUND_MS = 10 * 60 * 1000;
const TTL_MISSING_MS = 2 * 60 * 1000;

class LookupError extends Error {}

const cache = new Map(); // levelId -> { value, expires }
const inflight = new Map(); // levelId -> Promise

/** @returns {Promise<{name:string, top:number|null, difficulty:string, source:string}|null>} null = no está en la lista */
async function fromPointercrate(levelId) {
  const { status, body } = await request(`${POINTERCRATE_URL}?level_id=${levelId}`);
  if (status < 200 || status >= 300) throw new Error(`Pointercrate respondió HTTP ${status}`);

  const json = parseJson(body);
  const demon = Array.isArray(json) ? json[0] : null;
  if (!demon || !demon.name) return null;

  return {
    name: String(demon.name),
    top: Number.isInteger(demon.position) && demon.position > 0 ? demon.position : null,
    // La Demon List solo incluye Extreme Demons; se afina con los servidores de GD si responden
    difficulty: 'Extreme Demon',
    source: 'pointercrate',
  };
}

/**
 * AREDL: GET /v2/api/aredl/levels/{level_id}. 404 = ese nivel no está en la AREDL.
 * @returns {Promise<{name:string, top:number|null, difficulty:string, source:string}|null>}
 */
async function fromAredl(levelId) {
  const { status, body } = await request(`${AREDL_URL}${levelId}`);
  if (status === 404) return null;
  if (status < 200 || status >= 300) throw new Error(`AREDL respondió HTTP ${status}`);

  const json = parseJson(body);
  if (!json || typeof json !== 'object' || !json.name) throw new Error('AREDL: respuesta inesperada');
  // Si la API devuelve otro nivel distinto al pedido, se descarta
  if (json.level_id !== undefined && String(json.level_id) !== String(levelId)) {
    throw new Error('AREDL: la respuesta no corresponde a ese ID');
  }

  return {
    name: String(json.name),
    top: Number.isInteger(json.position) && json.position > 0 ? json.position : null,
    // La AREDL solo incluye Extreme Demons; se afina con los servidores de GD si responden
    difficulty: 'Extreme Demon',
    source: 'aredl',
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

const GD_DEMON_DIFFICULTY = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };
const GD_NORMAL_DIFFICULTY = { 10: 'Easy', 20: 'Normal', 30: 'Hard', 40: 'Harder', 50: 'Insane' };

/**
 * Dificultad a partir de los campos de un nivel de GD:
 *  17 = es demon, 43 = tipo de demon, 25 = es auto, 9 = dificultad normal (10 fácil ... 50 insane)
 */
function gdDifficulty(fields) {
  if (fields['17'] === '1') return GD_DEMON_DIFFICULTY[Number(fields['43'] || 0)] || 'Hard Demon';
  if (fields['25'] === '1') return 'Auto';
  return GD_NORMAL_DIFFICULTY[Number(fields['9'] || 0)] || 'NA';
}

/**
 * @returns {Promise<{name:string, top:null, difficulty:string, source:string}|null>}
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
  return { name: fields['2'], top: null, difficulty: gdDifficulty(fields), source: 'gd-servers' };
}

/** @returns {Promise<{name:string, top:number|null, difficulty:string|null, source:string}|null>} null = GDBrowser no lo encontró (no concluyente) */
async function fromGdBrowser(levelId) {
  const { status, body } = await request(`${GDBROWSER_URL}${levelId}`);
  const json = parseJson(body);

  if (json && typeof json === 'object' && json.name) {
    return {
      name: String(json.name),
      top: Number.isInteger(json.demonList) && json.demonList > 0 ? json.demonList : null,
      difficulty: json.difficulty ? String(json.difficulty) : null,
      source: 'gdbrowser',
    };
  }
  if (status === 404 || json === -1 || json === '-1' || (json && typeof json === 'object')) return null;
  throw new Error(`GDBrowser respondió HTTP ${status}`);
}

/** Mejor esfuerzo: los servidores de GD dicen la dificultad exacta; si fallan se queda "Extreme Demon" */
async function refineDifficulty(listed, levelId) {
  const gd = await fromGdServers(levelId).catch(() => null);
  if (gd?.difficulty) listed.difficulty = gd.difficulty;
  return listed;
}

async function search(levelId) {
  // 1) Pointercrate (Top + nombre)
  try {
    const listed = await fromPointercrate(levelId);
    if (listed) return await refineDifficulty(listed, levelId);
  } catch (err) {
    console.warn('[levelLookup] Pointercrate falló:', err.message);
  }

  // 1b) AREDL (Top + nombre) para los que Pointercrate no tiene
  try {
    const listed = await fromAredl(levelId);
    if (listed) return await refineDifficulty(listed, levelId);
  } catch (err) {
    console.warn('[levelLookup] AREDL falló:', err.message);
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
  sources: { fromPointercrate, fromAredl, fromGdServers, fromGdBrowser },
  _internals: { request, parseGdLevel, gdDifficulty },
};
