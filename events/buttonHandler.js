const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const { generatePartyImage } = require('../utils/canvasHelper');

async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    if (!['btn_join', 'btn_leave', 'btn_cancel', 'btn_edit_time'].includes(customId)) return;

    const message = interaction.message;
    const embed = message.embeds[0];
    const userId = interaction.user.id;

    if (!embed) return;

    let timeStr = "";
    let hostStr = "";
    let currentCount = 0;
    let maxPlayers = 0;
    let players = [];
    let standbys = [];

    const lines = embed.description.split('\n');
    let mode = 'header'; 

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('**เวลา:**')) {
            timeStr = line.replace('**เวลา:**', '').trim();
        } else if (line.startsWith('**ปาร์ตี้โดย:**')) {
            hostStr = line;
        } else if (line.startsWith('**รายชื่อผู้เข้าร่วม')) {
            mode = 'players';
            const match = line.match(/\((\d+)\/(\d+)\)/);
            if (match) {
                currentCount = parseInt(match[1]);
                maxPlayers = parseInt(match[2]);
            }
        } else if (line.startsWith('**ตัวสำรอง:**')) {
            mode = 'standbys';
        } else if (mode === 'players') {
            players.push(line);
        } else if (mode === 'standbys') {
            standbys.push(line);
        }
    }

    const userMention = `<@${userId}>`;
    const isHost = players.length > 0 && players[0].includes(userMention);
    const inPlayers = players.some(p => p.includes(userMention));
    const inStandbys = standbys.some(s => s.includes(userMention));

    if (customId === 'btn_cancel' || customId === 'btn_edit_time') {
        if (!isHost) {
            await interaction.reply({ content: 'คุณไม่ใช่หัวห้อง (Host) จึงไม่สามารถใช้คำสั่งนี้ได้', ephemeral: true });
            return;
        }

        if (customId === 'btn_cancel') {
            const newEmbed = EmbedBuilder.from(embed)
                .setColor(0xFF0000)
                .setTitle('❌ ' + embed.title.replace('🎮 ', ''))
                .setDescription('**ปาร์ตี้นี้ถูกยกเลิกแล้ว**\n\n' + embed.description)
                .setImage(null);
            
            await message.edit({ embeds: [newEmbed], components: [], attachments: [] });
            await interaction.reply({ content: 'ยกเลิกปาร์ตี้เรียบร้อยแล้ว', ephemeral: true });
            
            const { cancelJob } = require('../scheduler');
            cancelJob(message.id);
            return;
        }

        if (customId === 'btn_edit_time') {
            const modal = new ModalBuilder()
                .setCustomId('modal_edit_time')
                .setTitle('เลื่อนเวลาปาร์ตี้ (HH:MM)');

            const timeInput = new TextInputBuilder()
                .setCustomId('input_time')
                .setLabel('เวลาใหม่ที่ต้องการนัด (เช่น 20:30)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ต้องเป็น HH:MM เท่านั้น')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(timeInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
            return;
        }
    }

    if (customId === 'btn_join') {
        if (inPlayers || inStandbys) {
            await interaction.reply({ content: 'คุณอยู่ในปาร์ตี้ (หรือคิวตัวสำรอง) อยู่แล้ว!', ephemeral: true });
            return;
        }

        if (currentCount >= maxPlayers) {
            standbys.push(`${standbys.length + 1}. ${userMention}`);
            await interaction.reply({ content: 'ปาร์ตี้เต็มแล้ว คุณถูกจัดให้อยู่ในคิวตัวสำรอง!', ephemeral: true });
        } else {
            currentCount++;
            players.push(`${currentCount}. ${userMention}`);
            await interaction.reply({ content: 'คุณได้เข้าร่วมปาร์ตี้แล้ว!', ephemeral: true });
        }
    } else if (customId === 'btn_leave') {
        if (!inPlayers && !inStandbys) {
            await interaction.reply({ content: 'คุณไม่ได้อยู่ในปาร์ตี้นี้แต่แรกนะ!', ephemeral: true });
            return;
        }

        if (isHost) {
            await interaction.reply({ content: 'คุณเป็นคนสร้างตี้ (Host) ไม่สามารถออกได้! (กดปุ่ม "ยุติ" แทนครับ)', ephemeral: true });
            return;
        }

        if (inStandbys) {
            standbys = standbys.filter(line => !line.includes(userMention));
            await interaction.reply({ content: 'คุณออกจากคิวตัวสำรองแล้ว!', ephemeral: true });
        } else if (inPlayers) {
            players = players.filter(line => !line.includes(userMention));
            currentCount--;
            let msg = 'คุณได้ออกจากปาร์ตี้แล้ว!';

            if (standbys.length > 0) {
                const firstStandby = standbys.shift();
                const standbyMatch = firstStandby.match(/<@\d+>/);
                if (standbyMatch) {
                    currentCount++;
                    players.push(`${currentCount}. ${standbyMatch[0]}`);
                    msg += `\nมีการดึงตัวสำรอง ${standbyMatch[0]} เข้ามาเป็นตัวจริงแทน`;
                    await message.channel.send(`🔔 แจ้งเตือน: ${standbyMatch[0]} คุณได้เลื่อนเป็นตัวจริงในปาร์ตี้ **${embed.title}** แล้ว!`);
                }
            }
            await interaction.reply({ content: msg, ephemeral: true });
        }
        
        players = players.map((line, index) => {
            const namePart = line.substring(line.indexOf('.') + 1).trim();
            return `${index + 1}. ${namePart}`;
        });
        standbys = standbys.map((line, index) => {
            const namePart = line.substring(line.indexOf('.') + 1).trim();
            return `${index + 1}. ${namePart}`;
        });
    }

    // เตรียมข้อมูลสำหรับวาด Canvas ใหม่
    const playersArray = [];
    for (const pLine of players) {
        const match = pLine.match(/<@(\d+)>/);
        if (match) {
            const uid = match[1];
            try {
                const user = await interaction.client.users.fetch(uid);
                playersArray.push({
                    id: uid,
                    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 })
                });
            } catch (e) {
                playersArray.push({ id: uid, avatarUrl: null });
            }
        }
    }

    const gameName = embed.title.replace('🎮 ', '').trim();
    const cleanTime = timeStr.replace(/\*\(เลื่อนเวลาแล้ว\)\*/g, '').trim();
    const buffer = await generatePartyImage(gameName, cleanTime, maxPlayers, playersArray, standbys);
    const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });

    let newDesc = `**เวลา:** ${timeStr}\n${hostStr}\n\n**รายชื่อผู้เข้าร่วม (${currentCount}/${maxPlayers}):**\n${players.join('\n')}`;
    if (standbys.length > 0) {
        newDesc += `\n\n**ตัวสำรอง:**\n${standbys.join('\n')}`;
    }

    const newEmbed = EmbedBuilder.from(embed)
        .setDescription(newDesc)
        .setImage('attachment://party-banner.png');

    // ลบรูปเก่า และใส่รูปใหม่
    await message.edit({ embeds: [newEmbed], files: [attachment], attachments: [] });
}

module.exports = { handleButtonInteraction };
