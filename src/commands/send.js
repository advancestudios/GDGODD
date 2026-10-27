const {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { canManage } = require('../permissions');
const { describeError } = require('../hardestPublisher');

const MODAL_PREFIX = 'send_modal:';
const MODES = { normal: 'normal', embed: 'embed' };

// Igual que /setup: el permiso se comprueba en el código para que los dueños (OWNER_IDS) siempre puedan usarlo
const data = new SlashCommandBuilder()
  .setName('send')
  .setDescription('Envía un mensaje con el bot a un canal (solo staff)')
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('canal')
      .setDescription('Canal donde se enviará el mensaje')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('modo')
      .setDescription('Cómo se ve el mensaje (por defecto: normal)')
      .addChoices({ name: 'Normal (texto simple)', value: MODES.normal }, { name: 'Embed (Components V2, con título)', value: MODES.embed }),
  );

async function execute(interaction) {
  if (!canManage(interaction)) {
    return interaction.reply({
      content: '❌ Solo el staff con el permiso **Gestionar servidor** puede usar este comando.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const channel = interaction.options.getChannel('canal', true);
  const mode = interaction.options.getString('modo') || MODES.normal;

  const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}${channel.id}:${mode}`).setTitle('Enviar mensaje');
  if (mode === MODES.embed) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Título (opcional)').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false),
      ),
    );
  }
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Mensaje')
        .setPlaceholder('Soporta Markdown, menciones (<@&ID>) y saltos de línea')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(mode === MODES.embed ? 3800 : 2000)
        .setRequired(true),
    ),
  );
  await interaction.showModal(modal);
}

const isSendModal = (interaction) => interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX);

async function handleModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // Se vuelve a comprobar: el modal llega como una interacción nueva
  if (!canManage(interaction)) return interaction.editReply('❌ Solo el staff puede usar este comando.');

  const [channelId, mode] = interaction.customId.slice(MODAL_PREFIX.length).split(':');
  const content = interaction.fields.getTextInputValue('content').trim();
  const title = mode === MODES.embed ? interaction.fields.getTextInputValue('title').trim() : '';
  if (!content) return interaction.editReply('❌ El mensaje no puede estar vacío.');

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return interaction.editReply('❌ No pude acceder a ese canal. Revisa que el bot lo pueda ver.');

  const me = await interaction.guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  const missing = ['ViewChannel', 'SendMessages'].filter((flag) => !perms?.has(PermissionFlagsBits[flag]));
  if (missing.length) return interaction.editReply(`❌ Al bot le faltan permisos en ${channel}: **${missing.join(', ')}**.`);

  // Se pueden mencionar usuarios y roles, pero nunca @everyone / @here
  const allowedMentions = { parse: ['users', 'roles'] };
  const payload =
    mode === MODES.embed
      ? {
          // Sin setAccentColor: sin franja lateral, como el resto del bot
          components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(title ? `# ${title}\n${content}` : content))],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions,
        }
      : { content, allowedMentions };

  try {
    const sent = await channel.send(payload);
    return interaction.editReply(`✅ Mensaje enviado en ${channel}: ${sent.url}`);
  } catch (err) {
    console.error('[send] No pude enviar el mensaje:', err);
    return interaction.editReply(`❌ No pude enviarlo: ${describeError(err)}`);
  }
}

module.exports = { data, execute, handleModal, isSendModal, MODAL_PREFIX };
