// commands/start.js

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('Hướng dẫn kết nối tài khoản website với Discord'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🔗 Kết nối tài khoản website với Discord')
      .setDescription(
        'Để sử dụng các lệnh donate, bạn cần:\n\n' +
        '**1. Thêm Discord ID vào profile website**\n' +
        '• Vào trang profile của bạn trên website\n' +
        '• Thêm Discord ID vào trường "Discord ID"\n' +
        '• Lưu thay đổi\n\n' +
        '**2. Xác minh Discord ID**\n' +
        '• Dùng lệnh `/verify` với Discord ID của bạn\n' +
        '• Bot sẽ xác minh và kết nối tài khoản\n\n' +
        '**3. Sử dụng các lệnh donate**\n' +
        '• `/info` - Xem thông tin tài khoản\n' +
        '• `/naptien` - Hướng dẫn nạp tiền\n' +
        '• `/donate <username> <amount> [message]` - Donate cho user khác\n' +
        '  Ví dụ: `/donate username 50000 Cảm ơn bạn!`'
      )
      .setColor(0x00AE86)
      .setFooter({ text: 'Discord ID của bạn: ' + interaction.user.id });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
