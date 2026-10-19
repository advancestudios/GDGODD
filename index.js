require('dotenv').config();
const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const update = require('./src/commands/update');
const setup = require('./src/commands/setup');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = new Map([
  [update.data.name, update],
  [setup.data.name, setup],
]);

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot de GD listo como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      return await commands.get(interaction.commandName)?.execute(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === update.MODAL_ID) {
      return await update.handleModal(interaction);
    }
  } catch (err) {
    console.error('[interactionCreate]', err);
    const msg = { content: '❌ Ocurrió un error inesperado. Intenta de nuevo.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
