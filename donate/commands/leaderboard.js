const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'donate_users';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Hiển thị bảng xếp hạng donate (top 10)'),

  async execute(interaction) {
    const client = new MongoClient(MONGO_URI);
    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(COLLECTION_NAME);
      const top = await users.find({ donated: { $gt: 0 } })
        .sort({ donated: -1 })
        .limit(10)
        .toArray();
      if (!top.length) {
        return interaction.reply({ content: 'Chưa có ai donate!', ephemeral: false });
      }
      let desc = top.map((u, i) => `**${i+1}. <@${u._id}>**: ${u.donated?.toLocaleString() || 0} VNĐ`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('🏆 Bảng xếp hạng Donate')
        .setDescription(desc)
        .setColor(0xffd700)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (err) {
      console.error('❌ Lỗi khi lấy leaderboard:', err);
      await interaction.reply({ content: 'Có lỗi xảy ra khi lấy leaderboard.', flags: MessageFlags.Ephemeral });
    } finally {
      await client.close();
    }
  }
};