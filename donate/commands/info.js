const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { MongoClient } = require('mongodb');

// Cấu hình MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'users';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Hiển thị thông tin tài khoản của bạn'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const username = interaction.user.tag;

    const client = new MongoClient(MONGO_URI);

    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(COLLECTION_NAME);

      // Tìm user trong DB với discord_id đã xác minh
      const user = await users.findOne({ 
        discord_id: discordId,
        is_discord_verified: true
      });

      if (!user) {
        return interaction.reply({
          content: '⚠️ Bạn chưa kết nối tài khoản website với Discord. Vui lòng:\n1. Thêm Discord ID vào profile website\n2. Dùng lệnh `/verify` để xác minh',
          flags: MessageFlags.Ephemeral
        });
      }

      const balance = user.balance ?? 0;
      const donated = user.donated ?? 0;
      const verificationStatus = user.is_discord_verified ? '✅ Đã xác minh' : '❌ Chưa xác minh';

      const embed = new EmbedBuilder()
        .setTitle('📄 Thông tin tài khoản')
        .setColor(0x00AE86)
        .addFields(
          { name: '👤 Tên người dùng', value: user.username || username, inline: false },
          { name: '💰 Số dư', value: `**${balance.toLocaleString()} VNĐ**`, inline: true },
          { name: '💝 Đã donate', value: `**${donated.toLocaleString()} VNĐ**`, inline: true },
          { name: '🔗 Trạng thái Discord', value: verificationStatus, inline: false }
        )
        .setFooter({ text: `Discord ID: ${discordId}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });

    } catch (err) {
      console.error('❌ Lỗi khi truy vấn thông tin người dùng:', err);
      await interaction.reply({
        content: '⚠️ Không thể kiểm tra thông tin lúc này. Vui lòng thử lại sau.',
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await client.close();
    }
  }
};
