/**
 * Sesiones de vinculación pendientes (en memoria).
 * Cada una tiene un código único que el miembro debe publicar como comentario en su perfil de GD.
 * Si el bot se reinicia, las sesiones pendientes se pierden y el miembro solo repite el paso.
 */
const crypto = require('node:crypto');

// Sin letras/números que se confunden (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TTL_MS = 15 * 60 * 1000;
const CHECK_COOLDOWN_MS = 8000;

const sessions = new Map(); // userId de Discord -> sesión

function newCode() {
  const chars = Array.from(crypto.randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `URU-${chars}`;
}

function create(userId, { accountId, name }) {
  const session = { accountId: String(accountId), name, code: newCode(), expiresAt: Date.now() + TTL_MS, lastCheck: 0 };
  sessions.set(userId, session);
  return session;
}

function get(userId) {
  const session = sessions.get(userId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

function remove(userId) {
  sessions.delete(userId);
}

/** Milisegundos que faltan para poder volver a verificar (0 = ya se puede) */
function cooldownLeft(session) {
  return Math.max(0, session.lastCheck + CHECK_COOLDOWN_MS - Date.now());
}

module.exports = { create, get, remove, cooldownLeft, TTL_MS };
