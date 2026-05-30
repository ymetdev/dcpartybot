const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { generatePartyImage } = require('../utils/canvasHelper');
const { scheduleJob } = require('../scheduler');
const { GAMES, getGameConfig } = require('../config/games');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('สร้างปาร์ตี้หาคนเล่นเกม')
        .addStringOption(o => o.setName('game').setDescription('ชื่อเกม').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('time').setDescription('เวลาเริ่มเล่น เช่น 20:30').setRequired(true))
        .addIntegerOption(o => o.setName('max_players').setDescription('จำนวนสูงสุด (2-10)').setRequired(true).setMinValue(2).setMaxValue(10))
        .addStringOption(o => o.setName('details').setDescription('รายละเอียดเพิ่มเติม').setRequired(false)),

    async execute(interaction) {
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        const maxPlayers = interaction.options.getInteger('max_players');
        const details = interaction.options.getString('details');

        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
            await interaction.reply({ content: '❌ รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM เช่น 20:30', ephemeral: true });
            return;
        }
        if (details && details.length > 100) {
            await interaction.reply({ content: '❌ รายละเอียดยาวเกินไป (สูงสุด 100 ตัวอักษร)', ephemeral: true });
            return;
        }

        const hostId = interaction.user.id;
        const hostUser = await interaction.client.users.fetch(hostId);
        const gameConfig = getGameConfig(game);

        await interaction.deferReply();

        const playersArray = [{
            id: hostId,
            avatarUrl: hostUser.displayAvatarURL({ extension: 'png', size: 128 }),
            name: hostUser.username
        }];

        const buffer = await generatePartyImage(game, time, maxPlayers, playersArray, []);
        const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });

        // ── Description format ─────────────────────────────────────────────────
        // 🕐 เวลา  👑 host  📝 details  **ผู้เล่น N/M**  player lines  **ตัวสำรอง**  standby lines
        let desc = `🕐 ${time}\n👑 <@${hostId}>\n`;
        if (details) desc += `📝 ${details}\n`;
        desc += `\n**ผู้เล่น  1/${maxPlayers}**\n1. <@${hostId}> 👑`;

        const embed = new EmbedBuilder()
            .setColor(gameConfig.themeColor)
            .setTitle(`🎮 ${game}`)
            .setDescription(desc)
            .setImage('attachment://party-banner.png')
            .setTimestamp();

        // Row 1 — ทุกคน
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_join').setLabel('เข้าร่วม').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId('btn_leave').setLabel('ออก').setStyle(ButtonStyle.Secondary).setEmoji('🏃')
        );

        // Row 2 — Host เท่านั้น
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_edit_time').setLabel('เลื่อนเวลา').setStyle(ButtonStyle.Secondary).setEmoji('🕒'),
            new ButtonBuilder().setCustomId('btn_cancel').setLabel('ยุติ').setStyle(ButtonStyle.Danger).setEmoji('🛑'),
            new ButtonBuilder().setCustomId('btn_kick').setLabel('เตะออก').setStyle(ButtonStyle.Danger).setEmoji('👢'),
            new ButtonBuilder().setCustomId('btn_transfer').setLabel('โอน Host').setStyle(ButtonStyle.Secondary).setEmoji('👑')
        );

        const replyMsg = await interaction.editReply({ embeds: [embed], components: [row1, row2], files: [attachment] });

        if (gameConfig.hasRoles) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_role_${replyMsg.id}`)
                .setPlaceholder('เลือกตำแหน่งที่คุณจะเล่น (Host)')
                .addOptions(gameConfig.roles);
            await interaction.followUp({
                content: '👑 คุณเป็น Host — เลือกตำแหน่งของคุณ:',
                components: [new ActionRowBuilder().addComponents(selectMenu)],
                ephemeral: true
            });
        }

        scheduleJob(replyMsg, time);
    }
};
