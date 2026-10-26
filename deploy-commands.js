require('dotenv').config();
const { REST, Routes } = require('discord.js');
const update = require('./src/commands/update');
const setup = require('./src/commands/setup');
const gd = require('./src/commands/gd');
const help = require('./src/commands/help');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en el .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: [update.data.toJSON(), setup.data.toJSON(), gd.data.toJSON(), help.data.toJSON()],
    });
    console.log('✅ Comandos registrados en el servidor: /update hardest, /setup embed hardest, /setup revision, /gd cuenta, /gd desvincular y /help');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
