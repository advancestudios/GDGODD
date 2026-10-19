const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'hardest.json');

const DEFAULT_DATA = {
  // Mensaje del embed que se edita en cada actualización
  message: { channelId: null, messageId: null },
  // userId -> { userId, name (miembro de Discord), gdName (username de GD), level, top, levelId, worstFail, video, updatedAt }
  players: {},
};

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      message: { ...DEFAULT_DATA.message, ...(parsed.message || {}) },
      players: parsed.players || {},
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

function setMessage(channelId, messageId) {
  const data = load();
  data.message = { channelId, messageId };
  save(data);
}

module.exports = { load, save, getPlayer, upsertPlayer, setMessage };
