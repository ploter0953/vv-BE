const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'donate_users';
const ADMIN_ID = '1009443595394220153';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset trường donated về 0 cho tất cả user (chỉ admin dùng)'),

  async execute(interaction) {
    if (interaction.user.id !== ADMIN_ID) {
      return interaction.reply({
        content: 'Bạn không có quyền sử dụng lệnh này.',
        flags: MessageFlags.Ephemeral
      });
    }
    const client = new MongoClient(MONGO_URI);
    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(COLLECTION_NAME);
      const result = await users.updateMany({}, { $set: { donated: 0 } });
      await interaction.reply({
        content: `Đã reset trường donated về 0 cho ${result.modifiedCount} user.`,
        ephemeral: false
      });
    } catch (err) {
      console.error('❌ Lỗi khi reset donated:', err);
      await interaction.reply({
        content: 'Có lỗi xảy ra khi reset donated.',
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await client.close();
    }
  }
};