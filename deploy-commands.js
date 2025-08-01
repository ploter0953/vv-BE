const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  require('./donate/commands/naptien').data,
  require('./donate/commands/info').data,
  require('./donate/commands/donate').data,
  require('./donate/commands/start').data,
  require('./donate/commands/reset').data,
  require('./donate/commands/leaderboard').data,
  require('./donate/commands/verify').data
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();