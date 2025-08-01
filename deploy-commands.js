const { REST, Routes } = require('discord.js');
require('dotenv').config();

// Validate environment variables
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN === 'your_discord_bot_token_here') {
  console.error('❌ DISCORD_BOT_TOKEN is not set or is placeholder');
  process.exit(1);
}

if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === 'your_discord_client_id_here') {
  console.error('❌ DISCORD_CLIENT_ID is not set or is placeholder');
  process.exit(1);
}

const commands = [
  require('./donate/commands/naptien').data,
  require('./donate/commands/info').data,
  require('./donate/commands/donate').data,
  require('./donate/commands/start').data,
  require('./donate/commands/reset').data,
  require('./donate/commands/leaderboard').data,
  require('./donate/commands/verify').data
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('❌ Error deploying Discord commands:', error);
    process.exit(1);
  }
})();