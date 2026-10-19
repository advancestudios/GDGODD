/**
 * Cuentas de Geometry Dash (solo datos públicos, NUNCA se usan contraseñas):
 *  - findAccountByName: busca una cuenta por su username y devuelve su accountID.
 *  - getAccountById:    comprueba que la cuenta sigue existiendo y devuelve su username actual.
 *  - profileHasCode:    mira los comentarios del perfil y dice si el código de verificación está publicado.
 *
 * Fuente principal: servidores oficiales de GD. Respaldo: GDBrowser (solo si los oficiales fallan).
 * Todas lanzan AccountLookupError si no se pudo confirmar nada (para reintentar luego).
 */

const { request, parseJson } = require('./http');

const GD_BASE = 'http://www.boomlings.com/database/';
// Clave pública que usa el juego para sus consultas (no es un secreto)
const GD_SECRET = 'Wmfd2893gb7';
const GDBROWSER = 'https://gdbrowser.com/api';

const NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const nameCache = new Map(); // accountId -> { value, expires }

class AccountLookupError extends Error {}

function gdPost(endpoint, params) {
  return request(`${GD_BASE}${endpoint}`, {
    method: 'POST',
    // Los servidores de GD rechazan peticiones con User-Agent, por eso va vacío
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': '' },
    body: new URLSearchParams({ secret: GD_SECRET, ...params }).toString(),
  });
}

/** "1:Nombre:2:123:16:456" -> { 1: 'Nombre', 2: '123', 16: '456' } */
function parsePairs(str, separator) {
  const parts = str.split(separator);
  const fields = {};
  for (let i = 0; i + 1 < parts.length; i += 2) fields[parts[i]] = parts[i + 1];
  return fields;
}

/** Los comentarios de GD vienen en base64 "seguro para URL" */
function decodeComment(value) {
  try {
    return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function unexpected(source, status, text) {
  return new Error(`${source}: respuesta inesperada (HTTP ${status}) "${String(text).slice(0, 40)}"`);
}

const isAccountId = (value) => /^\d+$/.test(value || '') && value !== '0';

// ---------- Buscar cuenta por username ----------

async function findByNameOfficial(name) {
  const { status, body } = await gdPost('getGJUsers20.php', { str: name, total: '0', page: '0' });
  const text = body.trim();
  if (text === '-1' || text === '') return null; // sin resultados

  if (status < 200 || status >= 300 || !text.includes('#')) throw unexpected('Servidores de GD', status, text);

  const wanted = name.toLowerCase();
  const exact = text
    .split('#')[0]
    .split('|')
    .map((user) => parsePairs(user, ':'))
    .find((user) => (user['1'] || '').toLowerCase() === wanted && isAccountId(user['16']));

  return exact ? { accountId: exact['16'], name: exact['1'] } : null;
}

async function findByNameGdBrowser(name) {
  const { status, body } = await request(`${GDBROWSER}/profile/${encodeURIComponent(name)}`);
  const json = parseJson(body);

  if (json && typeof json === 'object' && isAccountId(String(json.accountID)) && json.username) {
    if (String(json.username).toLowerCase() !== name.toLowerCase()) return null;
    return { accountId: String(json.accountID), name: String(json.username) };
  }
  if (status === 404 || json === -1 || json === '-1') return null;
  throw unexpected('GDBrowser', status, body);
}

/** @returns {Promise<{accountId:string, name:string}|null>} null = no existe una cuenta con ese username exacto */
async function findAccountByName(name) {
  try {
    return await findByNameOfficial(name);
  } catch (err) {
    console.warn('[gdAccount] Servidores de GD fallaron buscando cuenta:', err.message);
  }
  try {
    const found = await findByNameGdBrowser(name);
    if (found) return found;
  } catch (err) {
    console.warn('[gdAccount] GDBrowser falló buscando cuenta:', err.message);
  }
  throw new AccountLookupError('No pude consultar las cuentas de GD.');
}

// ---------- Datos de una cuenta por accountID ----------

async function byIdOfficial(accountId) {
  const { status, body } = await gdPost('getGJUserInfo20.php', { targetAccountID: accountId });
  const text = body.trim();
  if (text === '-1') return null; // la cuenta no existe

  if (status < 200 || status >= 300) throw unexpected('Servidores de GD', status, text);

  const fields = parsePairs(text.split('#')[0], ':');
  if (fields['16'] !== accountId || !fields['1']) throw unexpected('Servidores de GD', status, text);
  return { accountId, name: fields['1'] };
}

async function byIdGdBrowser(accountId) {
  const { status, body } = await request(`${GDBROWSER}/profile/${accountId}`);
  const json = parseJson(body);

  if (json && typeof json === 'object' && String(json.accountID) === accountId && json.username) {
    return { accountId, name: String(json.username) };
  }
  throw unexpected('GDBrowser', status, body);
}

/** @returns {Promise<{accountId:string, name:string}|null>} null = la cuenta ya no existe */
async function getAccountById(accountId) {
  const id = String(accountId);
  const hit = nameCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;

  let result;
  try {
    result = await byIdOfficial(id);
  } catch (err) {
    console.warn('[gdAccount] Servidores de GD fallaron consultando la cuenta:', err.message);
    try {
      result = await byIdGdBrowser(id);
    } catch (err2) {
      console.warn('[gdAccount] GDBrowser falló consultando la cuenta:', err2.message);
      throw new AccountLookupError('No pude consultar las cuentas de GD.');
    }
  }

  nameCache.set(id, { value: result, expires: Date.now() + NAME_CACHE_TTL_MS });
  return result;
}

// ---------- Código de verificación en los comentarios del perfil ----------

async function commentsOfficial(accountId) {
  const { status, body } = await gdPost('getGJAccountComments20.php', { accountID: accountId, page: '0', total: '0' });
  const text = body.trim();
  if (text === '-1' || text === '') return []; // sin comentarios

  if (status < 200 || status >= 300 || !text.includes('#')) throw unexpected('Servidores de GD', status, text);

  const list = text.split('#')[0];
  if (!list) return [];
  return list
    .split('|')
    .map((comment) => decodeComment(parsePairs(comment, '~')['2'] ?? ''))
    .filter(Boolean);
}

async function commentsGdBrowser(accountId) {
  const { status, body } = await request(`${GDBROWSER}/comments/${accountId}?type=profile&count=20`);
  const json = parseJson(body);
  if (!Array.isArray(json)) throw unexpected('GDBrowser', status, body);
  return json.map((comment) => String(comment?.content ?? '')).filter(Boolean);
}

/** @returns {Promise<boolean>} true si algún comentario reciente del perfil contiene el código */
async function profileHasCode(accountId, code) {
  const id = String(accountId);
  let comments;
  try {
    comments = await commentsOfficial(id);
  } catch (err) {
    console.warn('[gdAccount] Servidores de GD fallaron leyendo comentarios:', err.message);
    try {
      comments = await commentsGdBrowser(id);
    } catch (err2) {
      console.warn('[gdAccount] GDBrowser falló leyendo comentarios:', err2.message);
      throw new AccountLookupError('No pude leer los comentarios del perfil.');
    }
  }
  const wanted = code.toLowerCase();
  return comments.some((comment) => comment.toLowerCase().includes(wanted));
}

function clearCache() {
  nameCache.clear();
}

module.exports = {
  findAccountByName,
  getAccountById,
  profileHasCode,
  AccountLookupError,
  clearCache,
  // Para el script de diagnóstico y las pruebas
  sources: { findByNameOfficial, findByNameGdBrowser, byIdOfficial, byIdGdBrowser, commentsOfficial, commentsGdBrowser },
  _internals: { parsePairs, decodeComment },
};
