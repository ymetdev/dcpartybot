const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { generatePartyImage } = require('../utils/canvasHelper');
const { scheduleJob } = require('../scheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('สร้างปาร์ตี้หาคนเล่นเกม')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('ชื่อเกมที่ต้องการเล่น (เช่น Valorant, Minecraft)')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('เวลาเริ่มเล่น (รูปแบบ HH:MM เช่น 20:30)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('max_players')
                .setDescription('จำนวนคนในตี้สูงสุด (2-10 คน)')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(10))
        .addStringOption(option =>
            option.setName('details')
                .setDescription('รายละเอียดเพิ่มเติม (เช่น หาคนแบก, เล่นชิลๆ)')
                .setRequired(false)),
    async execute(interaction) {
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        const maxPlayers = interaction.options.getInteger('max_players');
        const details = interaction.options.getString('details');

        // ตรวจสอบรูปแบบเวลา HH:MM
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            await interaction.reply({ content: '❌ กรุณาระบุเวลาให้ถูกต้องในรูปแบบ HH:MM เช่น 20:30', ephemeral: true });
            return;
        }

        const hostId = interaction.user.id;
        const hostUser = await interaction.client.users.fetch(hostId);
        
        await interaction.deferReply();

        // สร้างข้อมูลผู้เล่นสำหรับ Canvas
        const playersArray = [{
            id: hostId,
            avatarUrl: hostUser.displayAvatarURL({ extension: 'png', size: 128 }),
            name: hostUser.username
        }];

        // วาดภาพ Canvas
        const buffer = await generatePartyImage(game, time, maxPlayers, playersArray, []);
        const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });

        let desc = `**เวลา:** ${time}\n**ปาร์ตี้โดย:** <@${hostId}>\n`;
        if (details) {
            desc += `**รายละเอียด:** ${details}\n`;
        }
        desc += `\n**รายชื่อผู้เข้าร่วม (1/${maxPlayers}):**\n1. <@${hostId}> 👑`;

        const embed = new EmbedBuilder()
            .setColor(0x1A1A1D)
            .setTitle(`🎮 ${game}`)
            .setDescription(desc)
            .setImage('attachment://party-banner.png')
            .setFooter({ text: 'กดปุ่มด้านล่างเพื่อเข้าร่วมหรือออก' })
            .setTimestamp();

        const joinButton = new ButtonBuilder()
            .setCustomId('btn_join')
            .setLabel('เข้าร่วม (Join)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⚔️');

        const leaveButton = new ButtonBuilder()
            .setCustomId('btn_leave')
            .setLabel('ออก (Leave)')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🏃');
            
        const editTimeButton = new ButtonBuilder()
            .setCustomId('btn_edit_time')
            .setLabel('เลื่อนเวลา (Host)')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕒');
            
        const cancelButton = new ButtonBuilder()
            .setCustomId('btn_cancel')
            .setLabel('ยุติ (Host)')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛑');

        const row = new ActionRowBuilder()
            .addComponents(joinButton, leaveButton, editTimeButton, cancelButton);

        const replyMsg = await interaction.editReply({ 
            embeds: [embed], 
            components: [row], 
            files: [attachment]
        });
        
        // ถ้าเป็น Valorant ให้ดึงหัวห้องเลือกตำแหน่งด้วย
        const isValorant = game.toLowerCase().includes('valorant') || game.includes('วาโล');
        if (isValorant) {
            const { StringSelectMenuBuilder } = require('discord.js');
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_role_${replyMsg.id}`)
                .setPlaceholder('เลือกตำแหน่งที่คุณจะเล่น (Host)')
                .addOptions([
                    { label: 'Duelist', value: 'Duelist', emoji: '⚔️' },
                    { label: 'Initiator', value: 'Initiator', emoji: '👁️' },
                    { label: 'Controller', value: 'Controller', emoji: '💨' },
                    { label: 'Sentinel', value: 'Sentinel', emoji: '🛡️' },
                    { label: 'Flex', value: 'Flex', emoji: '🔄' }
                ]);
            const roleRow = new ActionRowBuilder().addComponents(selectMenu);
            // ให้ Host เลือกผ่านข้อความ ephemeral ที่ตามมา
            await interaction.followUp({ content: 'คุณเป็นหัวหน้าตี้! กรุณาเลือกตำแหน่งของคุณ:', components: [roleRow], ephemeral: true });
        }

        // ตั้งปลุก
        scheduleJob(replyMsg, time);
    },
};
