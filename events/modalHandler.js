const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { scheduleJob } = require('../scheduler');
const { generatePartyImage } = require('../utils/canvasHelper');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

async function handleModalInteraction(interaction) {
    if (interaction.customId !== 'modal_edit_time') return;

    const newTime = interaction.fields.getTextInputValue('input_time');
    const message = interaction.message;
    const embed = message?.embeds[0];
    if (!embed) return;

    if (!TIME_REGEX.test(newTime)) {
        await interaction.reply({ content: '❌ รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:MM เช่น 20:30', ephemeral: true });
        return;
    }

    try {
        const description = embed.description;
        const lines = description.split('\n');

        // อัปเดตบรรทัดเวลา (format: 🕐 HH:MM)
        if (lines[0].startsWith('🕐 ')) {
            lines[0] = `🕐 ${newTime} *(เลื่อนเวลาแล้ว)*`;
        }

        const newDescription = lines.join('\n');
        const newEmbed = EmbedBuilder.from(embed).setDescription(newDescription);

        await interaction.deferReply({ ephemeral: true });
        await message.edit({ embeds: [newEmbed] });
        await interaction.editReply({ content: `✅ เลื่อนเวลาเป็น **${newTime}** แล้ว` });

        scheduleJob(message, newTime);

        // Re-generate canvas
        const countMatch = description.match(/\*\*ผู้เล่น\s+(\d+)\/(\d+)\*\*/);
        const maxPlayers = countMatch ? parseInt(countMatch[2]) : 5;
        const gameName = embed.title.replace('🎮 ', '').trim();

        let players = [], standbys = [], parseMode = 'header';
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('**ผู้เล่น')) { parseMode = 'players'; }
            else if (line.startsWith('**ตัวสำรอง')) { parseMode = 'standbys'; }
            else if (parseMode === 'players' && /^\d+\./.test(line)) { players.push(line); }
            else if (parseMode === 'standbys' && /^\d+\./.test(line)) { standbys.push(line); }
        }

        const playersArray = [];
        for (const pLine of players) {
            const match = pLine.match(/<@(\d+)>(?:\s+\[(.*?)\])?/);
            if (match) {
                try {
                    const user = await interaction.client.users.fetch(match[1]);
                    playersArray.push({ id: match[1], avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }), name: user.username, role: match[2] || null });
                } catch (e) {
                    playersArray.push({ id: match[1], avatarUrl: null, name: 'Unknown', role: match[2] || null });
                }
            }
        }

        const standbysArray = [];
        for (const sLine of standbys) {
            const match = sLine.match(/<@(\d+)>/);
            if (match) {
                try {
                    const user = await interaction.client.users.fetch(match[1]);
                    standbysArray.push({ id: match[1], avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }), name: user.username });
                } catch (e) {
                    standbysArray.push({ id: match[1], avatarUrl: null, name: 'Unknown' });
                }
            }
        }

        const buffer = await generatePartyImage(gameName, newTime, maxPlayers, playersArray, standbysArray);
        const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });
        await message.edit({ embeds: [EmbedBuilder.from(newEmbed).setImage('attachment://party-banner.png')], files: [attachment], attachments: [] });

    } catch (error) {
        console.error('Modal interaction error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
            }
        } catch (e) {}
    }
}

module.exports = { handleModalInteraction };
