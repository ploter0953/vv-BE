const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');

class DiscordBotService {
  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });
    this.commands = new Collection();
    this.isReady = false;
  }

  async initialize() {
    try {
      // MongoDB connection is now lazy-loaded, no need to connect here

      // Load commands
      this.loadCommands();

      // Set up event handlers
      this.setupEventHandlers();

      // Login to Discord
      const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
      if (!DISCORD_BOT_TOKEN) {
        throw new Error('DISCORD_BOT_TOKEN env variable is required!');
      }

      await this.client.login(DISCORD_BOT_TOKEN);
      console.log('Discord bot initialized successfully');
    } catch (error) {
      console.error('Error initializing Discord bot:', error);
      throw error;
    }
  }

  loadCommands() {
    // Load all command files
    const commands = [
      require('../donate/commands/naptien'),
      require('../donate/commands/info'),
      require('../donate/commands/donate'),
      require('../donate/commands/start'),
      require('../donate/commands/reset'),
      require('../donate/commands/leaderboard'),
      require('../donate/commands/verify')
    ];

    commands.forEach(cmd => {
      this.commands.set(cmd.data.name, cmd);
      console.log(`Loaded command: ${cmd.data.name}`);
    });
  }

  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user.tag}`);
      this.isReady = true;
    });

    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('Error executing command:', error);
        await interaction.reply({ 
          content: 'Có lỗi xảy ra khi thực thi lệnh!', 
          flags: MessageFlags.Ephemeral 
        });
      }
    });
  }

  // Method to check if bot is ready
  isBotReady() {
    return this.isReady;
  }

  // Method to get bot client (for external use)
  getClient() {
    return this.client;
  }
}

// Create singleton instance
const discordBotService = new DiscordBotService();

module.exports = discordBotService;