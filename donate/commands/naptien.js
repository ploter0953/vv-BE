const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('naptien')
    .setDescription('Hiển thị thông tin hướng dẫn nạp tiền'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('💰 Hướng dẫn nạp tiền')
      .setDescription(
        'Bạn vui lòng chuyển tiền theo cú pháp sau:\n\n' +
        '**Nội dung chuyển khoản:** `DiscordID của bạn`\n' +
        '**Số tiền nạp:** Phải là bội số của 10,000 VNĐ\n\n' +
        'Ví dụ:\n`Số tiền: 20.000, 30.000`\n' +
        '`ID Discord của bạn là 123456789 thì chuyển khoản với nội dung 123456789`\n\n' +
        'Sau khi chuyển, hệ thống sẽ tự động cộng tiền vào tài khoản của bạn.'
      )
      .setFooter({ text: 'Liên hệ admin nếu cần hỗ trợ thêm.' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};
