const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const store = require('../hardestStore');
const { buildHardestEmbed } = require('../hardestEmbed');
const { EMPTY } = require('../config');

const MODAL_ID = 'hardest_modal';

const data = new SlashCommandBuilder()
  .setName('update')
  .setDescription('Actualiza tus datos en los rankings del servidor')
  .addSubcommand((sub) =>
    sub.setName('hardest').setDescription('Actualiza tu Hardest en el embed del Server Hardest'),
  );

function input(id, label, placeholder, { style = TextInputStyle.Short, max = 100, value } = {}) {
  const field = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setStyle(style)
    .setMaxLength(max)
    .setRequired(false);
  if (value) field.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(field);
}

/** /update hardest -> abre el cuadro de diálogo (modal) con tus datos actuales precargados */
async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'hardest') return;

  const current = store.getPlayer(interaction.user.id) || {};

  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Actualizar mi Hardest')
    .addComponents(
      input('level', 'Nivel', 'Ej: Slaughterhouse', { value: current.level }),
      input('top', 'Top (solo el número)', 'Ej: 37', { max: 5, value: current.top }),
      input('levelId', 'ID del nivel', 'Ej: 86407629', { max: 12, value: current.levelId }),
      input('worstFail', 'Peor fallo', 'Ej: 95% x2', { value: current.worstFail }),
      input('video', 'Link del video de YouTube (Completion)', 'https://youtu.be/...', {
        max: 300,
        value: current.video,
      }),
    );

  await interaction.showModal(modal);
}

function cleanText(value) {
  const text = (value || '').trim();
  return !text || text.toLowerCase() === EMPTY ? '' : text;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * Acepta solo links de VIDEO de YouTube (no canales, playlists ni otras webs):
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://www.youtube.com/shorts/ID | /live/ID | /embed/ID
 * Devuelve el link normalizado (sin parámetros de tracking).
 */
function parseYoutubeUrl(value) {
  const text = cleanText(value);
  if (!text) return { ok: true, value: '' };

  // Permite pegar "youtube.com/..." sin el https://
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false };

    const host = url.hostname.toLowerCase();
    let id = null;

    if (host === 'youtu.be') {
      id = url.pathname.split('/')[1];
    } else if (YOUTUBE_HOSTS.has(host)) {
      const [, kind, pathId] = url.pathname.split('/');
      if (kind === 'watch') id = url.searchParams.get('v');
      else if (['shorts', 'live', 'embed'].includes(kind)) id = pathId;
    }

    if (id && YOUTUBE_ID.test(id)) {
      return { ok: true, value: `https://www.youtube.com/watch?v=${id}` };
    }
  } catch {
    /* cae al error de abajo */
  }
  return { ok: false };
}

/** Recibe el modal, guarda los datos y edita (o crea) el embed */
async function handleModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawTop = cleanText(interaction.fields.getTextInputValue('top'));
  let top = null;
  if (rawTop) {
    if (!/^\d{1,5}$/.test(rawTop) || Number(rawTop) < 1) {
      return interaction.editReply('❌ El **Top** tiene que ser un número entero positivo (ej: `37`).');
    }
    top = Number(rawTop);
  }

  const levelId = cleanText(interaction.fields.getTextInputValue('levelId'));
  if (levelId && !/^\d{1,12}$/.test(levelId)) {
    return interaction.editReply('❌ El **ID del nivel** solo puede tener números.');
  }

  const video = parseYoutubeUrl(interaction.fields.getTextInputValue('video'));
  if (!video.ok) {
    return interaction.editReply(
      '❌ El **link del video** tiene que ser un video de YouTube (ej: `https://youtu.be/xxxxxxxxxxx` o `https://www.youtube.com/watch?v=xxxxxxxxxxx`).',
    );
  }

  const saved = store.upsertPlayer({
    userId: interaction.user.id,
    name: interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
    level: cleanText(interaction.fields.getTextInputValue('level')),
    top,
    levelId,
    worstFail: cleanText(interaction.fields.getTextInputValue('worstFail')),
    video: video.value,
  });

  const embed = buildHardestEmbed(saved.players);
  const result = await publishEmbed(interaction, embed, saved.message);

  if (!result.ok) {
    return interaction.editReply(`⚠️ Guardé tus datos, pero no pude actualizar el embed: ${result.reason}`);
  }
  return interaction.editReply(`✅ ¡Tu Hardest quedó actualizado! ${result.url}`);
}

/** Edita el mensaje existente; si no existe (o lo borraron), crea uno nuevo */
async function publishEmbed(interaction, embed, saved) {
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };

  try {
    if (saved.channelId && saved.messageId) {
      const channel = await interaction.client.channels.fetch(saved.channelId).catch(() => null);
      const message = channel ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
      if (message) {
        await message.edit(payload);
        return { ok: true, url: message.url };
      }
    }

    const channelId = process.env.HARDEST_CHANNEL_ID || interaction.channelId;
    const channel = await interaction.client.channels.fetch(channelId);
    const message = await channel.send(payload);
    store.setMessage(channel.id, message.id);
    return { ok: true, url: message.url };
  } catch (err) {
    console.error('[update hardest] Error publicando el embed:', err);
    return { ok: false, reason: 'revisa que el bot tenga permisos de ver el canal y enviar mensajes.' };
  }
}

module.exports = { data, execute, handleModal, parseYoutubeUrl, MODAL_ID };
