const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { scheduleJob } = require('../scheduler');
const { generatePartyImage } = require('../utils/canvasHelper');

async function handleModalInteraction(interaction) {
    if (interaction.customId === 'modal_edit_time') {
        const newTime = interaction.fields.getTextInputValue('input_time');
        const message = interaction.message;
        const embed = message.embeds[0];

        if (!embed) return;

        // ตรวจสอบ format เวลา
        if (!newTime.match(/^(\d{1,2}):(\d{2})$/)) {
            await interaction.reply({ content: '❌ กรุณาระบุเวลาในรูปแบบ **HH:MM** เท่านั้น เช่น `20:30` หรือ `09:00`', ephemeral: true });
            return;
        }

        // แกะ Description เดิมมาแก้เวลา
        const description = embed.description;
        const lines = description.split('\n');
        
        // บรรทัดที่ 0: **เวลา:** 20:00
        if (lines[0].startsWith('**เวลา:**')) {
            lines[0] = `**เวลา:** ${newTime} *(เลื่อนเวลาแล้ว)*`;
        }

        const newDescription = lines.join('\n');
        const newEmbed = EmbedBuilder.from(embed).setDescription(newDescription);

        await interaction.deferReply({ ephemeral: true });
        
        await message.edit({ embeds: [newEmbed] });
        await interaction.editReply({ content: `เลื่อนเวลาเป็น **${newTime}** เรียบร้อยแล้ว` });
        
        // อัปเดตตารางเวลา
        scheduleJob(message, newTime);

        // ดึงข้อมูลสำหรับ Canvas ใหม่
        const currentCountMatch = description.match(/\((\d+)\/(\d+)\)/);
        const maxPlayers = currentCountMatch ? parseInt(currentCountMatch[2]) : 5;
        const gameName = embed.title.replace('🎮 ', '').trim();
        
        let players = [];
        let standbys = [];
        let parseMode = 'header';

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            if (line.startsWith('**รายชื่อผู้เข้าร่วม')) {
                parseMode = 'players';
            } else if (line.startsWith('**ตัวสำรอง:**')) {
                parseMode = 'standbys';
            } else if (parseMode === 'players' && line.match(/^\d+\.\s<@\d+>/)) {
                players.push(line);
            } else if (parseMode === 'standbys' && line.match(/^\d+\.\s<@\d+>/)) {
                standbys.push(line);
            }
        }

        const playersArray = [];
        for (const pLine of players) {
            const match = pLine.match(/<@(\d+)>(?:\s+\[(.*?)\])?/);
            if (match) {
                const uid = match[1];
                const role = match[2] || null;
                try {
                    const user = await interaction.client.users.fetch(uid);
                    playersArray.push({
                        id: uid,
                        avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
                        name: user.username,
                        role: role
                    });
                } catch (e) {
                    playersArray.push({ id: uid, avatarUrl: null, name: 'Unknown', role: role });
                }
            }
        }

        const standbysArray = [];
        for (const sLine of standbys) {
            const match = sLine.match(/<@(\d+)>/);
            if (match) {
                const uid = match[1];
                try {
                    const user = await interaction.client.users.fetch(uid);
                    standbysArray.push({
                        id: uid,
                        avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
                        name: user.username
                    });
                } catch (e) {
                    standbysArray.push({ id: uid, avatarUrl: null, name: 'Unknown' });
                }
            }
        }

        const buffer = await generatePartyImage(gameName, newTime, maxPlayers, playersArray, standbysArray);
        const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });

        const newEmbedWithImage = EmbedBuilder.from(newEmbed).setImage('attachment://party-banner.png');
        await message.edit({ embeds: [newEmbedWithImage], files: [attachment], attachments: [] });
    }  
    else if (interaction.customId === 'modal_create_party') {
        const game = interaction.fields.getTextInputValue('input_game');
        const time = interaction.fields.getTextInputValue('input_time');
        const playersStr = interaction.fields.getTextInputValue('input_players');
        const maxPlayers = parseInt(playersStr);

        if (!time.match(/^(\d{1,2}):(\d{2})$/)) {
            await interaction.reply({ content: '❌ กรุณาระบุเวลาในรูปแบบ **HH:MM** เท่านั้น เช่น `20:30` หรือ `09:00`', ephemeral: true });
            return;
        }
        if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
            await interaction.reply({ content: '❌ จำนวนคนต้องเป็นตัวเลข 2 ถึง 10 เท่านั้น', ephemeral: true });
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

        const embed = new EmbedBuilder()
            .setColor(0x1A1A1D)
            .setTitle(`🎮 ${game}`)
            .setDescription(`**เวลา:** ${time}\n**ปาร์ตี้โดย:** <@${hostId}>\n\n**รายชื่อผู้เข้าร่วม (1/${maxPlayers}):**\n1. <@${hostId}> 👑`)
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
                .setCustomId('select_role')
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
    }
}

module.exports = { handleModalInteraction };
