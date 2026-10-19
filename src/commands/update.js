const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const store = require('../hardestStore');
const { refreshHardest } = require('../hardestPublisher');
const { lookupLevel, LookupError } = require('../levelLookup');
const { parseVideoLink } = require('../videoLink');
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
      input('gdName', 'Username de GD', 'Tu nombre en Geometry Dash', { max: 32, value: current.gdName }),
      input('levelId', 'ID del nivel', 'Ej: 86407629 (el Nivel y el Top se buscan solos)', {
        max: 12,
        value: current.levelId,
      }),
      input('worstFail', 'Peor fallo', 'Ej: 95% x2', { value: current.worstFail }),
      input('video', 'Link del video (Completion)', 'Enlace del mensaje o de multimedia del video', {
        max: 1000,
        value: current.video,
      }),
    );

  await interaction.showModal(modal);
}

function cleanText(value) {
  const text = (value || '').trim();
  return !text || text.toLowerCase() === EMPTY ? '' : text;
}

/** Recibe el modal, busca el nivel, guarda los datos y edita el mensaje del Hardest */
async function handleModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const levelId = cleanText(interaction.fields.getTextInputValue('levelId'));
  if (levelId && !/^\d{1,12}$/.test(levelId)) {
    return interaction.editReply('❌ El **ID del nivel** solo puede tener números (ej: `86407629`).');
  }

  const video = parseVideoLink(interaction.fields.getTextInputValue('video'), interaction.guildId);
  if (!video.ok) {
    return interaction.editReply(
      video.reason === 'other-server'
        ? '❌ Ese link de mensaje es de **otro servidor**. Sube el video a un canal de este servidor y copia el enlace desde ahí.'
        : '❌ El **link del video** no es válido. Sube el video a un canal del servidor y usa **Copiar enlace del mensaje** (o **Copiar enlace de multimedia**) sobre el video.',
    );
  }

  // Con el ID, el bot busca solo el nombre del nivel y su Top
  const previous = store.getPlayer(interaction.user.id);
  let level = '';
  let top = null;
  let lookupNote = '';

  if (levelId) {
    try {
      const found = await lookupLevel(levelId);
      if (!found) {
        return interaction.editReply(`❌ No encontré ningún nivel con el ID \`${levelId}\`. Revisa que esté bien escrito.`);
      }
      level = found.name;
      top = found.top;
    } catch (err) {
      if (!(err instanceof LookupError)) console.error('[update hardest] Error buscando el nivel:', err);

      if (previous?.levelId === levelId && previous.level) {
        // Mismo nivel que ya tenías guardado: se conservan su nombre y su Top y no se pierde la actualización
        level = previous.level;
        top = previous.top ?? null;
        lookupNote = '⚠️ No pude consultar el nivel ahora, así que dejé el nombre y el Top que ya tenías guardados.';
      } else {
        return interaction.editReply(
          '⚠️ Los servicios de niveles no respondieron en este momento. No guardé nada: intenta de nuevo en un minuto.',
        );
      }
    }
  }

  store.upsertPlayer({
    userId: interaction.user.id,
    name: interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
    gdName: cleanText(interaction.fields.getTextInputValue('gdName')),
    level,
    top,
    levelId,
    worstFail: cleanText(interaction.fields.getTextInputValue('worstFail')),
    video: video.value,
  });

  const result = await refreshHardest(interaction.client);
  if (!result.ok) {
    return interaction.editReply(`⚠️ Guardé tus datos, pero no pude actualizar el Hardest: ${result.reason}`);
  }

  const lines = [`✅ ¡Tu Hardest quedó actualizado! ${result.url}`];
  if (levelId) {
    lines.push(`📌 Nivel: **${level}** — ${top ? `Top **${top}**` : 'no está en la Demon List (Top sin definir)'}`);
  }
  if (lookupNote) lines.push(lookupNote);
  if (video.kind === 'cdn') {
    lines.push(
      '⚠️ Usaste un enlace de multimedia: Discord hace que esos links caduquen con el tiempo. Para que el video no deje de abrir, mejor usa **Copiar enlace del mensaje**.',
    );
  }
  return interaction.editReply(lines.join('\n'));
}

module.exports = { data, execute, handleModal, MODAL_ID };
