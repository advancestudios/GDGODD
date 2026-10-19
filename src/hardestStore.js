const fs = require('node:fs');
const path = require('node:path');

// DATA_DIR permite apuntar a un disco persistente (por ejemplo en Render: /var/data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'hardest.json');

const DEFAULT_DATA = {
  // Mensaje del Hardest que se edita en cada actualización (lo fija /setup embed hardest)
  message: { guildId: null, channelId: null, messageId: null },
  // userId -> { userId, name (miembro de Discord), gdName (username de GD), accountId, level, top, levelId, worstFail, video, updatedAt }
  players: {},
  // userId de Discord -> { accountId, gdName, linkedAt }  (cuenta de GD verificada)
  accounts: {},
};

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      message: { ...DEFAULT_DATA.message, ...(parsed.message || {}) },
      players: parsed.players || {},
      accounts: parsed.accounts || {},
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[hardestStore] No se pudo leer el JSON, se usa vacío:', err);
    return structuredClone(DEFAULT_DATA);
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Escritura atómica: primero a un temporal y luego se renombra
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function getPlayer(userId) {
  return load().players[userId] || null;
}

function upsertPlayer(player) {
  const data = load();
  data.players[player.userId] = { ...player, updatedAt: Date.now() };
  save(data);
  return data;
}

function setMessage({ guildId, channelId, messageId }) {
  const data = load();
  data.message = { guildId, channelId, messageId };
  save(data);
}

// ---------- Cuentas de GD vinculadas ----------

function getAccount(userId) {
  return load().accounts[userId] || null;
}

/** userId de Discord que ya tiene vinculada esa cuenta de GD (o null) */
function findOwnerOfAccount(accountId) {
  const wanted = String(accountId);
  for (const [userId, account] of Object.entries(load().accounts)) {
    if (account.accountId === wanted) return userId;
  }
  return null;
}

/** Vincula una cuenta de GD a un usuario. Una cuenta de GD solo puede estar con un usuario de Discord. */
function linkAccount(userId, { accountId, gdName }) {
  const ownerId = findOwnerOfAccount(accountId);
  if (ownerId && ownerId !== userId) return { ok: false, ownerId };

  const data = load();
  data.accounts[userId] = { accountId: String(accountId), gdName, linkedAt: Date.now() };
  save(data);
  return { ok: true };
}

function updateAccountName(userId, gdName) {
  const data = load();
  if (!data.accounts[userId]) return;
  data.accounts[userId].gdName = gdName;
  if (data.players[userId]) data.players[userId].gdName = gdName;
  save(data);
}

/** Desvincula la cuenta y quita también su entrada del Hardest. Devuelve true si había algo que quitar. */
function unlinkAccount(userId) {
  const data = load();
  const had = Boolean(data.accounts[userId] || data.players[userId]);
  delete data.accounts[userId];
  delete data.players[userId];
  if (had) save(data);
  return had;
}

module.exports = {
  load,
  save,
  getPlayer,
  upsertPlayer,
  setMessage,
  getAccount,
  findOwnerOfAccount,
  linkAccount,
  updateAccountName,
  unlinkAccount,
  DATA_FILE,
};
