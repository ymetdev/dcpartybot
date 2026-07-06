const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generatePartyImage } = require('../utils/canvasHelper');
const { getGameConfig } = require('../config/games');

const processingMessages = new Set();

// ─── คำแซวคนแย่สุด (สุ่มเปลี่ยนไปเรื่อยๆ ไม่ให้ซ้ำจนน่าเบื่อ) ───────────────────
const ROAST_LINES = [
    'ยิงปืนหรือให้ปืนดูก็ไม่รู้',
    'ให้ Vandal ไปสักก็คงยิงแม่นกว่านี้',
    'ทีมแบกจนหลังหัก',
    'เก็บ agent ไปทำ support สายเสิร์ฟน้ำดีกว่า',
    'ตายไวกว่า WiFi หลุดอีก',
    'MVP ฝั่งศัตรูอยู่กับเรามาโดยไม่รู้ตัว',
    'จอมงีบกลางแมพ',
    'K/D นี้ขอเมตตาหน่อยพี่',
];

function _pickRoastLine() {
    return ROAST_LINES[Math.floor(Math.random() * ROAST_LINES.length)];
}

// ─── Description parser ───────────────────────────────────────────────────────
// Format: 🕐 time | 👑 <@host> | 📝 details | **ผู้เล่น N/M** | player lines | **ตัวสำรอง** | standby lines

function _parsePlayersFromEmbed(description) {
    let timeStr = '', hostStr = '', detailsStr = '';
    let maxPlayers = 0, players = [], standbys = [];
    let mode = 'header';

    for (let line of description.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('🕐 ')) {
            timeStr = line.replace('🕐 ', '').trim();
        } else if (line.startsWith('👑 ')) {
            hostStr = line;
        } else if (line.startsWith('📝 ')) {
            detailsStr = line;
        } else if (line.startsWith('**ผู้เล่น')) {
            mode = 'players';
            const m = line.match(/(\d+)\/(\d+)/);
            if (m) maxPlayers = parseInt(m[2]);
        } else if (line.startsWith('**ตัวสำรอง')) {
            mode = 'standbys';
        } else if (mode === 'players' && /^\d+\./.test(line)) {
            players.push(line);
        } else if (mode === 'standbys' && /^\d+\./.test(line)) {
            standbys.push(line);
        }
    }
    return { timeStr, hostStr, detailsStr, maxPlayers, players, standbys };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _buildRoleMenu(customId, placeholder, game) {
    return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(game.roles);
}

async function _tryDM(client, userId, content) {
    try { const u = await client.users.fetch(userId); await u.send(content); } catch (e) {}
}

async function _rebuildEmbed(interaction, gameName, game, timeStr, hostStr, detailsStr, maxPlayers, players, standbys, freshEmbed, freshMsg) {
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

    const cleanTime = timeStr.replace(/\*\(เลื่อนเวลาแล้ว\)\*/g, '').trim();
    const buffer = await generatePartyImage(gameName, cleanTime, maxPlayers, playersArray, standbysArray);
    const attachment = new AttachmentBuilder(buffer, { name: 'party-banner.png' });

    let newDesc = `🕐 ${timeStr}\n${hostStr}\n`;
    if (detailsStr) newDesc += `${detailsStr}\n`;
    newDesc += `\n**ผู้เล่น  ${players.length}/${maxPlayers}**\n${players.join('\n')}`;
    if (standbys.length > 0) newDesc += `\n\n**ตัวสำรอง**\n${standbys.join('\n')}`;

    await freshMsg.edit({
        embeds: [EmbedBuilder.from(freshEmbed).setDescription(newDesc).setImage('attachment://party-banner.png')],
        files: [attachment],
        attachments: []
    });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    const isSelectRole = customId === 'select_role' || customId.startsWith('select_role_');
    const isSelectKick = customId.startsWith('select_kick_');
    const isSelectTransfer = customId.startsWith('select_transfer_');
    const isSummary = customId.startsWith('btn_summary_');

    if (!['btn_join', 'btn_leave', 'btn_cancel', 'btn_edit_time', 'btn_kick', 'btn_transfer'].includes(customId)
        && !isSelectRole && !isSelectKick && !isSelectTransfer && !isSummary) return;

    // ── สรุปผล & จบ Session (เฉพาะ Valorant ที่ผูก Riot ID ไว้) ──────────────────
    // ดึงแมตช์ Competitive ทั้งหมดหลังปาร์ตี้เริ่ม รวม K/D ของแต่ละคน แล้วหาผู้เล่นดีที่สุด/แย่ที่สุด
    if (isSummary) {
        const sessionKey = customId.replace('btn_summary_', '');
        const { getSession, removeSession } = require('../utils/sessionStore');
        const session = getSession(sessionKey);

        if (!session) {
            await interaction.reply({ content: '❌ Session นี้ถูกสรุปไปแล้ว หรือหมดอายุ', ephemeral: true });
            return;
        }
        if (interaction.user.id !== session.hostId) {
            await interaction.reply({ content: '❌ เฉพาะ Host เท่านั้นที่จบ Session ได้', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        const { getLink } = require('../utils/playerLinks');
        const { fetchCompetitiveMatchesSince } = require('../utils/valorantApi');

        const finish = async (description) => {
            const summaryEmbed = new EmbedBuilder()
                .setTitle(`📊 สรุปผลปาร์ตี้ ${session.gameName}`)
                .setDescription(description)
                .setColor(0x5865F2)
                .setFooter({ text: 'นับเฉพาะฝั่งเดียวกับ Host ในแมตช์ Competitive หลังปาร์ตี้เริ่ม — ข้อมูลจาก HenrikDev API (unofficial)' });
            await interaction.editReply({ embeds: [summaryEmbed] });
            try { await interaction.message.edit({ components: [] }); } catch (e) {}
            removeSession(sessionKey);
        };

        // ใช้แมตช์ของ Host เป็นตัวยึด แล้วดึงสถิติเพื่อนร่วมทีมจาก roster ของแมตช์เดียวกันนั้นเลย
        // แม่นกว่าให้แต่ละคน query ประวัติตัวเองแยกกัน ซึ่งอาจได้แมตช์คนละอันที่ไม่เกี่ยวกับปาร์ตี้นี้
        const hostLink = getLink(session.hostId);
        if (!hostLink) {
            await finish(`❌ Host <@${session.hostId}> ยังไม่ได้ /link Riot ID ไว้ — ระบบต้องอาศัยแมตช์ของ Host เป็นหลัก จึงสรุปผลไม่ได้`);
            return;
        }

        let hostMatches;
        try {
            hostMatches = await fetchCompetitiveMatchesSince(hostLink.region, hostLink.name, hostLink.tag, session.startedAtMs);
        } catch (e) {
            await finish('❌ ดึงข้อมูลจาก Valorant API ไม่สำเร็จ ลองใหม่อีกครั้ง');
            return;
        }
        if (hostMatches.length === 0) {
            await finish(`❌ ไม่พบแมตช์ Competitive ของ Host หลังปาร์ตี้เริ่ม`);
            return;
        }

        // riot name#tag (lowercase) -> discord uid ของคนที่ /link ไว้ในปาร์ตี้นี้
        const linkedByRiotKey = new Map();
        for (const uid of session.playerIds) {
            const link = getLink(uid);
            if (link) linkedByRiotKey.set(`${link.name}#${link.tag}`.toLowerCase(), uid);
        }

        // รวมสถิติเฉพาะคนที่อยู่ฝั่งเดียวกับ Host ในแต่ละแมพที่ Host เล่น
        const totals = new Map(); // uid -> { kills, deaths, maps }
        for (const match of hostMatches) {
            for (const p of match.players) {
                if (p.team !== match.myTeam) continue;
                const uid = linkedByRiotKey.get(`${p.name}#${p.tag}`.toLowerCase());
                if (!uid) continue;
                const cur = totals.get(uid) || { kills: 0, deaths: 0, maps: 0 };
                cur.kills += p.kills;
                cur.deaths += p.deaths;
                cur.maps += 1;
                totals.set(uid, cur);
            }
        }

        const rows = session.playerIds.map(uid => {
            const t = totals.get(uid);
            if (!t) return { uid, status: getLink(uid) ? 'not-in-match' : 'unlinked' };
            const kd = t.deaths > 0 ? t.kills / t.deaths : t.kills;
            return { uid, status: 'ok', mapCount: t.maps, kills: t.kills, deaths: t.deaths, kd };
        });

        const ranked = rows.filter(r => r.status === 'ok');
        const best = ranked.length > 0 ? ranked.reduce((a, b) => (b.kd > a.kd ? b : a)) : null;
        const worst = ranked.length > 1 ? ranked.reduce((a, b) => (b.kd < a.kd ? b : a)) : null;

        const lines = rows.map(r => {
            if (r.status === 'unlinked') return `<@${r.uid}> — ยังไม่ได้ /link ไว้`;
            if (r.status === 'not-in-match') return `<@${r.uid}> — ไม่พบในแมตช์เดียวกับ Host`;
            const isWorst = r.uid === worst?.uid;
            const tag = r.uid === best?.uid ? ' 🏆' : (isWorst ? ' 🪦' : '');
            const roast = isWorst ? ` _(${_pickRoastLine()})_` : '';
            return `<@${r.uid}> — ${r.mapCount} แมพ | K/D รวม ${r.kills}/${r.deaths} (${r.kd.toFixed(2)})${tag}${roast}`;
        });

        await finish(`อ้างอิงจากแมตช์ของ Host <@${session.hostId}> (${hostMatches.length} แมพ)\n\n${lines.join('\n')}`);
        return;
    }

    // ── Fetch message ─────────────────────────────────────────────────────────
    let message;
    const selectPrefix =
        customId.startsWith('select_role_') ? 'select_role_' :
        customId.startsWith('select_kick_') ? 'select_kick_' :
        customId.startsWith('select_transfer_') ? 'select_transfer_' : null;

    if (selectPrefix) {
        try {
            message = await interaction.channel.messages.fetch(customId.replace(selectPrefix, ''));
        } catch (e) {
            await interaction.reply({ content: '❌ ไม่พบโพสต์ปาร์ตี้', ephemeral: true });
            return;
        }
    } else {
        message = interaction.message;
    }

    const embed = message?.embeds[0];
    if (!embed) return;

    const userId = interaction.user.id;
    const userMention = `<@${userId}>`;
    const gameName = embed.title.replace('🎮 ', '').trim();
    const game = getGameConfig(gameName);

    // ตรวจ Host จาก 👑 line
    const hostMatch = embed.description.match(/👑 <@(\d+)>/);
    const isHost = hostMatch ? hostMatch[1] === userId : false;

    // ── Host-only (ก่อน lock) ─────────────────────────────────────────────────
    if (['btn_cancel', 'btn_edit_time', 'btn_kick', 'btn_transfer'].includes(customId)) {
        if (!isHost) {
            await interaction.reply({ content: '❌ เฉพาะ Host เท่านั้น', ephemeral: true });
            return;
        }

        if (customId === 'btn_cancel') {
            // ล็อกเหมือนปุ่มอื่น กัน join/leave ที่ค้างอยู่ rebuild embed ทับสถานะยกเลิกกลับมา
            if (processingMessages.has(message.id)) {
                await interaction.reply({ content: '⏳ กรุณารอสักครู่', ephemeral: true });
                return;
            }
            processingMessages.add(message.id);
            try {
                const newEmbed = EmbedBuilder.from(embed)
                    .setColor(0xFF4444)
                    .setTitle('❌ ' + embed.title.replace('🎮 ', ''))
                    .setDescription('ปาร์ตี้นี้ถูกยกเลิกแล้ว')
                    .setImage(null);
                await message.edit({ embeds: [newEmbed], components: [], attachments: [] });
                await interaction.reply({ content: '✅ ยุติปาร์ตี้แล้ว', ephemeral: true });
                const { cancelJob } = require('../scheduler');
                cancelJob(message.id);
            } finally {
                processingMessages.delete(message.id);
            }
            return;
        }

        if (customId === 'btn_edit_time') {
            const modal = new ModalBuilder().setCustomId('modal_edit_time').setTitle('เลื่อนเวลา');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('input_time').setLabel('เวลาใหม่ (HH:MM)').setStyle(TextInputStyle.Short).setPlaceholder('เช่น 21:00').setRequired(true)
            ));
            await interaction.showModal(modal);
            return;
        }

        // btn_kick / btn_transfer — แสดง dropdown
        await interaction.deferReply({ ephemeral: true });
        const hostIdVal = hostMatch ? hostMatch[1] : null;
        const options = [];
        let inPlayerMode = false;
        for (const line of embed.description.split('\n')) {
            const t = line.trim();
            if (t.startsWith('**ผู้เล่น')) { inPlayerMode = true; continue; }
            if (t.startsWith('**') && !t.startsWith('**ผู้เล่น')) inPlayerMode = false;
            if (inPlayerMode && /^\d+\./.test(t)) {
                const m = t.match(/<@(\d+)>/);
                if (m && m[1] !== hostIdVal) {
                    try {
                        const user = await interaction.client.users.fetch(m[1]);
                        options.push({ label: user.username, value: m[1] });
                    } catch (e) { options.push({ label: `User ${m[1]}`, value: m[1] }); }
                }
            }
        }
        if (options.length === 0) {
            await interaction.editReply({ content: '❌ ไม่มีผู้เล่นอื่น' });
            return;
        }
        const isKick = customId === 'btn_kick';
        const menu = new StringSelectMenuBuilder()
            .setCustomId(isKick ? `select_kick_${message.id}` : `select_transfer_${message.id}`)
            .setPlaceholder(isKick ? 'เลือกผู้เล่นที่จะเตะออก' : 'เลือกผู้เล่นที่จะโอน Host ให้')
            .addOptions(options);
        await interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
        return;
    }

    // ── Lock ──────────────────────────────────────────────────────────────────
    if (processingMessages.has(message.id)) {
        await interaction.reply({ content: '⏳ กรุณารอสักครู่', ephemeral: true });
        return;
    }
    processingMessages.add(message.id);

    try {
        const freshMsg = await interaction.channel.messages.fetch(message.id);
        const freshEmbed = freshMsg?.embeds[0];
        if (!freshEmbed || freshEmbed.title?.includes('❌')) {
            await interaction.reply({ content: '❌ ปาร์ตี้ถูกยกเลิกแล้ว', ephemeral: true });
            return;
        }

        let { timeStr, hostStr, detailsStr, maxPlayers, players, standbys } = _parsePlayersFromEmbed(freshEmbed.description);
        const beforeCount = players.length;
        const inPlayers = players.some(p => p.includes(userMention));
        const inStandbys = standbys.some(s => s.includes(userMention));

        // ── btn_join ──────────────────────────────────────────────────────────
        if (customId === 'btn_join') {
            if (game.requiresLink) {
                const { getLink } = require('../utils/playerLinks');
                if (!getLink(userId)) {
                    await interaction.reply({ content: `❌ ต้อง /link Riot ID ก่อนถึงจะเข้าร่วมปาร์ตี้ **${gameName}** ได้ (ใช้สรุปสถิติหลังจบปาร์ตี้)`, ephemeral: true });
                    return;
                }
            }
            if (inPlayers) {
                if (game.hasRoles) {
                    const menu = _buildRoleMenu(`select_role_${message.id}`, 'เปลี่ยนตำแหน่ง', game);
                    await interaction.reply({ content: 'เลือกตำแหน่งใหม่:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ คุณอยู่ในปาร์ตี้แล้ว', ephemeral: true });
                }
                return;
            }
            if (inStandbys) {
                await interaction.reply({ content: '❌ คุณอยู่ในคิวสำรองแล้ว', ephemeral: true });
                return;
            }
            if (game.hasRoles && players.length < maxPlayers) {
                const menu = _buildRoleMenu(`select_role_${message.id}`, 'เลือกตำแหน่งที่จะเล่น', game);
                await interaction.reply({ content: 'เลือกตำแหน่ง:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
                return;
            }
            if (players.length >= maxPlayers) {
                standbys.push(`${standbys.length + 1}. ${userMention}`);
                await interaction.reply({ content: '✅ ปาร์ตี้เต็ม — เพิ่มในคิวสำรองแล้ว', ephemeral: true });
            } else {
                players.push(`${players.length + 1}. ${userMention}`);
                await interaction.reply({ content: '✅ เข้าร่วมแล้ว!', ephemeral: true });
            }

        // ── select_role ───────────────────────────────────────────────────────
        } else if (isSelectRole) {
            const role = interaction.values[0];
            if (inPlayers) {
                const idx = players.findIndex(p => p.includes(userMention));
                if (idx !== -1) players[idx] = `${idx + 1}. ${userMention} [${role}]`;
                await interaction.update({ content: `✅ เปลี่ยนเป็น **${role}**`, components: [] });
            } else if (inStandbys) {
                await interaction.update({ content: '❌ คุณอยู่ในคิวสำรอง', components: [] });
                return;
            } else {
                if (players.length >= maxPlayers) {
                    standbys.push(`${standbys.length + 1}. ${userMention}`);
                    await interaction.update({ content: '✅ ปาร์ตี้เต็ม — เพิ่มในคิวสำรองแล้ว', components: [] });
                } else {
                    players.push(`${players.length + 1}. ${userMention} [${role}]`);
                    await interaction.update({ content: `✅ เข้าร่วมในตำแหน่ง **${role}**`, components: [] });
                }
            }

        // ── btn_leave ─────────────────────────────────────────────────────────
        } else if (customId === 'btn_leave') {
            if (!inPlayers && !inStandbys) {
                await interaction.reply({ content: '❌ คุณไม่ได้อยู่ในปาร์ตี้', ephemeral: true });
                return;
            }
            if (isHost) {
                await interaction.reply({ content: '❌ Host ออกไม่ได้ — กด "ยุติ" แทน', ephemeral: true });
                return;
            }
            if (inStandbys) {
                standbys = standbys.filter(l => !l.includes(userMention));
                await interaction.reply({ content: '✅ ออกจากคิวสำรองแล้ว', ephemeral: true });
            } else {
                players = players.filter(l => !l.includes(userMention));
                let msg = '✅ ออกจากปาร์ตี้แล้ว';
                if (standbys.length > 0) {
                    const first = standbys.shift();
                    const sm = first.match(/<@\d+>/);
                    if (sm) {
                        players.push(`${players.length + 1}. ${sm[0]}`);
                        msg += ` — ดึง ${sm[0]} จากคิวสำรองขึ้นมา`;
                        await freshMsg.channel.send(`🔔 ${sm[0]} เลื่อนเป็นตัวจริงในปาร์ตี้ **${gameName}** แล้ว!`);
                    }
                }
                await interaction.reply({ content: msg, ephemeral: true });
            }
            players = players.map((l, i) => `${i + 1}. ${l.substring(l.indexOf('.') + 1).trim()}`);
            standbys = standbys.map((l, i) => `${i + 1}. ${l.substring(l.indexOf('.') + 1).trim()}`);

        // ── select_kick ───────────────────────────────────────────────────────
        } else if (isSelectKick) {
            const kickedId = interaction.values[0];
            const kickedMention = `<@${kickedId}>`;
            if (!players.some(p => p.includes(kickedMention))) {
                await interaction.update({ content: '❌ ผู้เล่นคนนี้ไม่ได้อยู่ในปาร์ตี้แล้ว', components: [] });
                return;
            }
            players = players.filter(p => !p.includes(kickedMention));
            let kickMsg = `✅ เตะ ${kickedMention} ออกแล้ว`;
            if (standbys.length > 0) {
                const first = standbys.shift();
                const sm = first.match(/<@\d+>/);
                if (sm) {
                    players.push(`${players.length + 1}. ${sm[0]}`);
                    kickMsg += ` — ดึง ${sm[0]} ขึ้นมาแทน`;
                    await freshMsg.channel.send(`🔔 ${sm[0]} เลื่อนเป็นตัวจริงในปาร์ตี้ **${gameName}** แล้ว!`);
                }
            }
            players = players.map((l, i) => `${i + 1}. ${l.substring(l.indexOf('.') + 1).trim()}`);
            standbys = standbys.map((l, i) => `${i + 1}. ${l.substring(l.indexOf('.') + 1).trim()}`);
            await _tryDM(interaction.client, kickedId, `❌ คุณถูกเตะออกจากปาร์ตี้ **${gameName}**`);
            await interaction.update({ content: kickMsg, components: [] });

        // ── select_transfer ───────────────────────────────────────────────────
        } else if (isSelectTransfer) {
            const newHostId = interaction.values[0];
            const newHostMention = `<@${newHostId}>`;
            if (!players.some(p => p.includes(newHostMention))) {
                await interaction.update({ content: '❌ ผู้เล่นคนนี้ไม่ได้อยู่ในปาร์ตี้แล้ว', components: [] });
                return;
            }
            hostStr = `👑 ${newHostMention}`;
            players = players.map(p => p.replace(' 👑', ''));
            const nhIdx = players.findIndex(p => p.includes(newHostMention));
            if (nhIdx !== -1) players[nhIdx] += ' 👑';
            await _tryDM(interaction.client, newHostId, `👑 คุณได้รับสิทธิ์ Host ของปาร์ตี้ **${gameName}** แล้ว!`);
            await interaction.update({ content: `✅ โอน Host ให้ ${newHostMention} แล้ว`, components: [] });
        }

        // ── Rebuild embed + canvas ────────────────────────────────────────────
        await _rebuildEmbed(interaction, gameName, game, timeStr, hostStr, detailsStr, maxPlayers, players, standbys, freshEmbed, freshMsg);

        // แจ้ง Host เมื่อปาร์ตี้เพิ่งเต็ม
        if (players.length === maxPlayers && beforeCount < maxPlayers) {
            const hId = hostMatch ? hostMatch[1] : null;
            if (hId) {
                await freshMsg.channel.send(`🎉 <@${hId}> ปาร์ตี้ **${gameName}** เต็มแล้ว! (${maxPlayers}/${maxPlayers})`);
                await _tryDM(interaction.client, hId, `🎉 ปาร์ตี้ **${gameName}** เต็มแล้ว! ผู้เล่นครบ ${maxPlayers} คน`);
            }
        }

    } catch (error) {
        console.error('Button interaction error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่', ephemeral: true });
            }
        } catch (e) {}
    } finally {
        processingMessages.delete(message.id);
    }
}

module.exports = { handleButtonInteraction };
