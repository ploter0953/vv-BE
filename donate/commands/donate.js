const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { saveDonation } = require('../mongo');
const { MongoClient } = require('mongodb');

const LOG_CHANNEL_ID = '1279062001586278411'; // Thay bằng kênh log thực tế
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const USERS_COLLECTION = 'users';
const DONATIONS_COLLECTION = 'donations';

let donateCooldown = false;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Donate cho người dùng khác trên projectvtuber.com')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Username của người nhận donate trên projectvtuber.com')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('display_name')
        .setDescription('Tên hiển thị khi donate')
        .setRequired(true)
        .setMaxLength(50))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Số tiền donate (bội số 10,000 VNĐ)')
        .setRequired(true)
        .setMinValue(10000))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Lời nhắn (tùy chọn)')
        .setRequired(false)
        .setMaxLength(100)),

  async execute(interaction) {
    if (donateCooldown) {
      return interaction.reply({
        content: 'Vừa có người donate gần đây, bạn đợi 20 giây rồi thử lại nhé!',
        flags: MessageFlags.Ephemeral
      });
    }

    const discordId = interaction.user.id;
    const targetUsername = interaction.options.getString('username');
    const displayName = interaction.options.getString('display_name');
    const amount = interaction.options.getInteger('amount');
    const message = interaction.options.getString('message') || 'Không có';

    if (amount < 10000 || amount % 10000 !== 0) {
      return interaction.reply({
        content: '⚠️ Số tiền phải lớn hơn 10,000 VNĐ và là bội số của 10,000 VNĐ!',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const client = new MongoClient(MONGO_URI);
      await client.connect();
      const db = client.db(DB_NAME);
      const users = db.collection(USERS_COLLECTION);

      // Tìm user donate (người thực hiện donate)
      const donor = await users.findOne({
        discord_id: discordId,
        is_discord_verified: true
      });

      if (!donor) {
        await client.close();
        return interaction.reply({
          content: '⚠️ Bạn chưa kết nối tài khoản website với Discord. Vui lòng:\n1. Thêm Discord ID vào profile website\n2. Dùng lệnh `/verify` để xác minh',
          flags: MessageFlags.Ephemeral
        });
      }

      if (donor.balance < amount) {
        await client.close();
        return interaction.reply({
          content: `❌ Số dư không đủ. Hiện có: ${donor.balance.toLocaleString()} VNĐ`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Tìm user nhận donate
      const recipient = await users.findOne({
        username: targetUsername
      });

      if (!recipient) {
        await client.close();
        return interaction.reply({
          content: `❌ Không tìm thấy user "${targetUsername}" trên projectvtuber.com. Vui lòng kiểm tra lại username.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Kiểm tra không donate cho chính mình
      if (donor._id.toString() === recipient._id.toString()) {
        await client.close();
        return interaction.reply({
          content: '❌ Bạn không thể donate cho chính mình.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Cập nhật balance và donated cho donor
      await users.updateOne(
        { _id: donor._id },
        { 
          $inc: { 
            balance: -amount,
            donated: amount
          } 
        }
      );

      // Cập nhật donate_received cho recipient
      await users.updateOne(
        { _id: recipient._id },
        { 
          $inc: { 
            donate_received: amount
          } 
        }
      );

      // Cooldown 20 giây
      donateCooldown = true;
      setTimeout(() => { donateCooldown = false; }, 20000);

      // Embed phản hồi
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 Donate thành công!')
        .addFields(
          { name: 'Người donate', value: displayName, inline: true },
          { name: 'Người nhận', value: recipient.username, inline: true },
          { name: 'Số tiền', value: `${amount.toLocaleString()} VNĐ`, inline: true },
          { name: 'Lời nhắn', value: String(message) },
          { name: '', value: '`Tin nhắn của bạn sẽ hiển thị trên stream sau 5-10 giây xử lí`', inline: true }
        )
        .setDescription("`Cảm ơn bạn vì đã donate cho ${recipient.username}, mỗi lượt ủng hộ của bạn là động lực để chúng mình tiếp tục cố gắng!`")
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });

      // Gửi log đến kênh
      const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('📢 Ghi nhận donate')
          .addFields(
            { name: 'Discord', value: `<@${discordId}> (${discordId})`, inline: false },
            { name: 'Người donate', value: donor.username || interaction.user.username, inline: true },
            { name: 'Người nhận', value: recipient.username, inline: true },
            { name: 'Số tiền', value: `${amount.toLocaleString()} VNĐ`, inline: true },
            { name: 'Lời nhắn', value: String(message), inline: false }
          )
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }

      // Save donation record cho recipient
      const donationData = {
        userId: recipient._id.toString(), // Lưu cho người nhận donate
        name: displayName, // Sử dụng display name thay vì username
        amount: amount,
        message: message,
        source: 'discord',
        donorId: donor._id.toString() // Thêm thông tin donor
      };
      await saveDonation(donationData);

      await client.close();

    } catch (error) {
      console.error('❌ Lỗi khi xử lý donate:', error);
      await interaction.reply({
        content: '⚠️ Có lỗi xảy ra khi xử lý donate. Vui lòng thử lại sau.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
