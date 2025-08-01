const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'users';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Hiển thị bảng xếp hạng donate (top 10)')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Loại bảng xếp hạng')
        .setRequired(false)
        .addChoices(
          { name: 'Top Donators', value: 'donators' },
          { name: 'Top Vtubers', value: 'vtubers' }
        )),

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'donators';
    const client = new MongoClient(MONGO_URI);
    
    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(COLLECTION_NAME);
      
      const sortField = type === 'donators' ? 'donated' : 'donate_received';
      const title = type === 'donators' ? '🏆 Top Donators' : '🎭 Top Vtubers';
      
      const top = await users.find({ [sortField]: { $gt: 0 } })
        .sort({ [sortField]: -1 })
        .limit(10)
        .project({
          username: 1,
          donated: 1,
          donate_received: 1
        })
        .toArray();
        
      if (!top.length) {
        return interaction.reply({ 
          content: `Chưa có ai ${type === 'donators' ? 'donate' : 'nhận donate'}!`, 
          ephemeral: false 
        });
      }
      
      let desc = top.map((u, i) => {
        const amount = type === 'donators' ? u.donated : u.donate_received;
        return `**${i+1}. ${u.username}**: ${amount?.toLocaleString() || 0} VNĐ`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0xffd700)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (err) {
      console.error('❌ Lỗi khi lấy leaderboard:', err);
      await interaction.reply({ 
        content: 'Có lỗi xảy ra khi lấy leaderboard.', 
        flags: MessageFlags.Ephemeral 
      });
    } finally {
      await client.close();
    }
  }
};