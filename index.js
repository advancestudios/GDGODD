require('dotenv').config();
const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const update = require('./src/commands/update');
const setup = require('./src/commands/setup');
const gd = require('./src/commands/gd');
const help = require('./src/commands/help');
const linkFlow = require('./src/linkFlow');
const review = require('./src/review');
const { ownerCount } = require('./src/permissions');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = new Map([
  [update.data.name, update],
  [setup.data.name, setup],
  [gd.data.name, gd],
  [help.data.name, help],
]);

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot de GD listo como ${c.user.tag}`);
  if (!ownerCount()) console.warn('⚠️ OWNER_IDS está vacío: nadie tiene acceso total de dueño.');
  else console.log(`👑 Dueños configurados: ${ownerCount()}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      return await commands.get(interaction.commandName)?.execute(interaction);
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === update.MODAL_ID) return await update.handleModal(interaction);
      if (interaction.customId === linkFlow.LINK_MODAL_ID) return await linkFlow.handleLinkModal(interaction);
      if (review.isRejectModal(interaction)) return await review.handleRejectModal(interaction);
    }
    if (help.isHelpButton(interaction)) {
      return await help.handleButton(interaction);
    }
    if (review.isReviewButton(interaction)) {
      return await review.handleButton(interaction);
    }
    if (linkFlow.isLinkButton(interaction)) {
      return await linkFlow.handleButton(interaction);
    }
  } catch (err) {
    console.error('[interactionCreate]', err);
    const msg = { content: '❌ Ocurrió un error inesperado. Intenta de nuevo.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

function shutdown(signal) {
  console.log(`Recibí ${signal}, cerrando el bot...`);
  client.destroy().finally(() => process.exit(0));
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ No pude iniciar sesión (revisa DISCORD_TOKEN en el .env):', err.message);
  process.exit(1);
});
