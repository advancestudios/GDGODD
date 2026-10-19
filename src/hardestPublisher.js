const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const store = require('./hardestStore');
const { buildHardestPayload } = require('./hardestView');

// Permisos que necesita el bot en el canal del Hardest
const REQUIRED_PERMISSIONS = [
  ['ViewChannel', 'Ver canal'],
  ['SendMessages', 'Enviar mensajes'],
  ['ReadMessageHistory', 'Leer el historial de mensajes'],
];

// Cola: evita que dos actualizaciones a la vez creen mensajes duplicados
let queue = Promise.resolve();
function serialize(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function describeError(err) {
  switch (err?.code) {
    case 50001:
      return 'el bot no tiene acceso a ese canal (le falta el permiso **Ver canal**).';
    case 50013:
      return 'al bot le faltan permisos en ese canal (**Enviar mensajes** y/o **Leer el historial de mensajes**).';
    case 10003:
    case 10008:
      return 'el canal o el mensaje del Hardest ya no existe. Un admin debe volver a usar `/setup embed hardest`.';
    default:
      return 'ocurrió un error inesperado al publicar. Avísale al staff para que revise los logs del bot.';
  }
}

async function deleteMessage(client, location) {
  if (!location?.channelId || !location?.messageId) return;
  try {
    const channel = await client.channels.fetch(location.channelId);
    const message = await channel.messages.fetch(location.messageId);
    await message.delete();
  } catch {
    /* ya no existe o no hay permisos: no pasa nada */
  }
}

/**
 * /setup embed hardest: valida permisos, envía el mensaje del Hardest al canal elegido
 * (con los jugadores ya guardados) y lo deja registrado para que /update lo edite ahí.
 */
function setupHardest(channel) {
  return serialize(async () => {
    const me = await channel.guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    const missing = REQUIRED_PERMISSIONS.filter(([flag]) => !perms?.has(PermissionFlagsBits[flag])).map(
      ([, label]) => label,
    );
    if (missing.length) {
      return { ok: false, reason: `al bot le faltan estos permisos en ${channel}: **${missing.join(', ')}**.` };
    }

    try {
      const data = store.load();
      const previous = data.message;
      const message = await channel.send(buildHardestPayload(data.players));
      store.setMessage({ guildId: channel.guildId, channelId: channel.id, messageId: message.id });

      // Si ya había un mensaje del Hardest en otro lado, se borra para no dejar duplicados
      if (previous.messageId && previous.messageId !== message.id) {
        await deleteMessage(channel.client, previous);
      }
      return { ok: true, message };
    } catch (err) {
      console.error('[hardestPublisher] Error en setup:', err);
      return { ok: false, reason: describeError(err) };
    }
  });
}

/**
 * Re-dibuja el Hardest con los datos guardados y edita el mensaje configurado.
 * No toca a nadie más: simplemente muestra los mejores jugadores guardados.
 */
function refreshHardest(client) {
  return serialize(async () => {
    const data = store.load();
    const { guildId, channelId, messageId } = data.message;

    if (!channelId) {
      return {
        ok: false,
        notConfigured: true,
        reason: 'todavía no se configuró el canal del Hardest. Un admin debe usar `/setup embed hardest`.',
      };
    }

    try {
      const payload = buildHardestPayload(data.players);
      const channel = await client.channels.fetch(channelId);
      const current = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;

      // Un mensaje viejo (embed clásico) no se puede convertir a Components V2: se reemplaza por uno nuevo
      if (current && current.flags.has(MessageFlags.IsComponentsV2)) {
        await current.edit(payload);
        return { ok: true, url: current.url };
      }

      const sent = await channel.send(payload);
      store.setMessage({ guildId, channelId, messageId: sent.id });
      if (current) await current.delete().catch(() => {});
      return { ok: true, url: sent.url };
    } catch (err) {
      console.error('[hardestPublisher] Error actualizando el Hardest:', err);
      return { ok: false, reason: describeError(err) };
    }
  });
}

module.exports = { setupHardest, refreshHardest, describeError };
