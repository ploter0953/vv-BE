const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'users';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Xác minh Discord ID với tài khoản website')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Discord ID bạn muốn xác minh')
        .setRequired(true)),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const inputId = interaction.options.getString('id');

    // Kiểm tra xem ID nhập vào có phải là ID của người dùng không
    if (inputId !== discordId) {
      return interaction.reply({
        content: '❌ ID bạn nhập không khớp với Discord ID của bạn. Vui lòng kiểm tra lại.',
        flags: MessageFlags.Ephemeral
      });
    }

    const client = new MongoClient(MONGO_URI);

    try {
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(COLLECTION_NAME);

      // Tìm user có discord_id trùng khớp và chưa được xác minh
      const user = await users.findOne({
        discord_id: discordId,
        is_discord_verified: false
      });

      if (!user) {
        return interaction.reply({
          content: '❌ Không có người dùng nào đang chờ xác minh với ID này. Vui lòng kiểm tra lại hoặc liên hệ admin.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Lấy Discord username từ interaction
      const discordUsername = interaction.user.username;
      
      console.log('=== DISCORD VERIFY ===');
      console.log('User ID:', user._id);
      console.log('Discord ID:', discordId);
      console.log('Discord Username:', discordUsername);
      
      // Cập nhật trạng thái xác minh và Discord username
      const updateResult = await users.updateOne(
        { _id: user._id },
        { 
          $set: { 
            is_discord_verified: true,
            discord: discordUsername // Lưu Discord username
          } 
        }
      );
      
      console.log('Update result:', updateResult);

      // Tạo embed thông báo thành công
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Xác minh thành công!')
        .setDescription(`Tài khoản Discord của bạn đã được kết nối với **${user.username}**`)
        .addFields(
          { name: 'Discord ID', value: discordId, inline: true },
          { name: 'Username', value: user.username, inline: true },
          { name: 'Trạng thái', value: 'Đã xác minh', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Bây giờ bạn có thể sử dụng các lệnh donate' });

      await interaction.reply({ 
        embeds: [embed], 
        ephemeral: false 
      });

      console.log(`✅ User ${discordId} đã xác minh thành công với tài khoản ${user.username}`);

    } catch (error) {
      console.error('❌ Lỗi khi xác minh Discord ID:', error);
      await interaction.reply({
        content: '❌ Có lỗi xảy ra khi xác minh. Vui lòng thử lại sau.',
        flags: MessageFlags.Ephemeral
      });
    } finally {
      await client.close();
    }
  }
};