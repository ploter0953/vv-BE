const { SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');

// Thay token bot và client ID bot của bạn ở đây
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN env variable is required!');
const clientId = '1207126819191394314';

// Định nghĩa command
const command = new SlashCommandBuilder()
  .setName('naptien')
  .setDescription('Hiển thị thông tin hướng dẫn nạp tiền');

// Hàm deploy command (global)
async function deployCommand() {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('🚀 Đang deploy command...');
    await rest.put(
      Routes.applicationCommands(clientId),  // Global command
      { body: [command.toJSON()] }
    );
    console.log('✅ Đã deploy thành công command /naptien');
  } catch (error) {
    console.error('❌ Lỗi deploy command:', error);
  }
}

// Export module
module.exports = {
  data: command,
  execute: async function (interaction) {
    await interaction.reply({
      embeds: [{
        title: '💰 Hướng dẫn nạp tiền',
        description:
          'Bạn vui lòng chuyển tiền theo cú pháp sau:\n\n' +
          '**Nội dung chuyển khoản:** `DiscordID của bạn`\n' +
          '**Số tiền nạp:** Phải là bội số của 10,000 VNĐ\n\n' +
          'Ví dụ:\n`Số tiền: 20.000, 30.000`\n' +
          '`ID Discord của bạn là 123456789 thì chuyển khoản với nội dung 123456789\n`' +
          'Sau khi chuyển, hệ thống sẽ tự động cộng tiền vào tài khoản của bạn.',
        color: 0x00FF00,
        footer: { text: 'Liên hệ admin nếu cần hỗ trợ thêm.' }
      }],
      flags: MessageFlags.Ephemeral
    });
  },
  deployCommand,  // Xuất luôn hàm deploy để bạn gọi khi cần
};

// Nếu chạy file này trực tiếp sẽ tự động deploy command
if (require.main === module) {
  deployCommand();
}
