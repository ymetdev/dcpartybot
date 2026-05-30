const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const { getGameConfig } = require('./config/games');

const jobs = new Map();
const checkins = new Map();           // partyMessageId -> Set<userId>
const reminderMessageIds = new Map(); // partyMessageId -> [msgId, ...]
const JOBS_FILE = path.join(__dirname, 'scheduled_jobs.json');

// ─── File persistence ────────────────────────────────────────────────────────

function _loadJobsData() {
    try {
        if (fs.existsSync(JOBS_FILE)) return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    } catch (e) { console.error('Error reading jobs file:', e); }
    return {};
}

function _saveJobToFile(messageId, channelId, exactTimeISO) {
    const data = _loadJobsData();
    data[messageId] = { channelId, exactTimeISO, checkins: [], reminderMessageIds: [] };
    try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving jobs file:', e); }
}

function _persistReminderIds(messageId, ids) {
    const data = _loadJobsData();
    if (data[messageId]) {
        data[messageId].reminderMessageIds = ids;
        try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
    }
}

function _removeJobFromFile(messageId) {
    const data = _loadJobsData();
    if (!data[messageId]) return;
    delete data[messageId];
    try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving jobs file:', e); }
}

// ─── In-memory helpers ────────────────────────────────────────────────────────

function _cancelJobInMemory(messageId) {
    const jobList = jobs.get(messageId);
    if (jobList) { jobList.forEach(j => j.cancel()); jobs.delete(messageId); }
}

function _cleanup(messageId) {
    _removeJobFromFile(messageId);
    jobs.delete(messageId);
    checkins.delete(messageId);
    reminderMessageIds.delete(messageId);
}

// ─── Embed parser ────────────────────────────────────────────────────────────

function _parsePlayerIds(description) {
    const playerIds = [], standbyIds = [];
    let mode = 'header';
    for (const line of description.split('\n')) {
        const t = line.trim();
        if (t.startsWith('**ผู้เล่น')) { mode = 'players'; continue; }
        if (t.startsWith('**ตัวสำรอง')) { mode = 'standbys'; continue; }
        const m = t.match(/<@(\d+)>/);
        if (m) {
            if (mode === 'players') playerIds.push(m[1]);
            else if (mode === 'standbys') standbyIds.push(m[1]);
        }
    }
    return { playerIds, standbyIds };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function recordCheckin(partyMessageId, userId) {
    if (!checkins.has(partyMessageId)) checkins.set(partyMessageId, new Set());
    checkins.get(partyMessageId).add(userId);
    // Persist
    const data = _loadJobsData();
    if (data[partyMessageId]) {
        data[partyMessageId].checkins = Array.from(checkins.get(partyMessageId));
        try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
    }
}

function getCheckinCount(partyMessageId) {
    return checkins.get(partyMessageId)?.size ?? 0;
}

function getReminderMessageIds(messageId) {
    const inMem = reminderMessageIds.get(messageId);
    if (inMem?.length) return inMem;
    const data = _loadJobsData();
    return data[messageId]?.reminderMessageIds || [];
}

function getExactTime(timeStr) {
    if (!timeStr.match(/^(\d{1,2}):(\d{2})$/)) return null;
    const t = moment.tz(timeStr, 'HH:mm', 'Asia/Bangkok');
    if (t.isBefore(moment.tz('Asia/Bangkok'))) t.add(1, 'day');
    return t.toDate();
}

// ─── Core scheduler ───────────────────────────────────────────────────────────

function _scheduleJobInternal(message, exactTime) {
    const messageId = message.id;
    _cancelJobInMemory(messageId);

    const reminderTime = new Date(exactTime.getTime() - 5 * 60 * 1000);
    const now = new Date();
    const jobList = [];

    async function _tryDM(client, userId, dmEmbed) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [dmEmbed] });
        } catch (e) {}
    }

    async function executeAlert(isFinal) {
        try {
            const fetchedMsg = await message.channel.messages.fetch(messageId);
            if (!fetchedMsg?.embeds[0]) return;
            if (fetchedMsg.embeds[0].title.includes('❌')) { _cleanup(messageId); return; }

            const embed = fetchedMsg.embeds[0];
            let currentCount = 0, maxPlayers = 0;
            const cm = embed.description.match(/\*\*ผู้เล่น\s+(\d+)\/(\d+)\*\*/);
            if (cm) { currentCount = parseInt(cm[1]); maxPlayers = parseInt(cm[2]); }

            const gameName = embed.title.replace('🎮 ', '');
            const game = getGameConfig(gameName);

            // Collect all mentions for pings
            const allMentions = [];
            const mr = /<@\d+>/g; let mn;
            while ((mn = mr.exec(embed.description)) !== null) {
                if (!allMentions.includes(mn[0])) allMentions.push(mn[0]);
            }

            // ── FINAL ALERT ──────────────────────────────────────────────────
            if (isFinal) {
                const isPartyFull = maxPlayers === 0 || currentCount >= maxPlayers;

                // ไม่ครบคน → ยกเลิก
                if (!isPartyFull) {
                    if (allMentions.length > 0) {
                        await message.channel.send({
                            content: `${allMentions.join(' ')}\n❌ ปาร์ตี้ **${gameName}** ถูกยกเลิกอัตโนมัติ เนื่องจากผู้เล่นไม่ครบ (${currentCount}/${maxPlayers} คน)`
                        });
                    }
                    for (const rid of getReminderMessageIds(messageId)) {
                        try { const m = await message.channel.messages.fetch(rid); await m.delete(); } catch (e) {}
                    }
                    try { await fetchedMsg.delete(); } catch (e) {}
                    _cleanup(messageId);
                    return;
                }

                // ครบคน — ตรวจ check-in
                const { playerIds, standbyIds } = _parsePlayerIds(embed.description);
                const wasCheckinDone = checkins.has(messageId);
                let finalPlayerIds, absentMentions = [];

                if (wasCheckinDone) {
                    const confirmed = checkins.get(messageId);
                    const confirmedPlayers = playerIds.filter(uid => confirmed.has(uid));
                    const absentPlayers = playerIds.filter(uid => !confirmed.has(uid));
                    const confirmedStandbys = standbyIds.filter(uid => confirmed.has(uid));

                    finalPlayerIds = [...confirmedPlayers];
                    for (const uid of confirmedStandbys) {
                        if (finalPlayerIds.length < playerIds.length) finalPlayerIds.push(uid);
                    }
                    absentMentions = absentPlayers.map(uid => `<@${uid}>`);

                    if (finalPlayerIds.length === 0) {
                        await message.channel.send({
                            content: `${allMentions.join(' ')}\n❌ ปาร์ตี้ **${gameName}** ถูกยกเลิกอัตโนมัติ เนื่องจากไม่มีผู้เล่นยืนยันเข้าร่วม`
                        });
                        const rIds = reminderMessageIds.get(messageId) || [];
                        for (const rid of rIds) {
                            try { const m = await message.channel.messages.fetch(rid); await m.delete(); } catch (e) {}
                        }
                        try { await fetchedMsg.delete(); } catch (e) {}
                        _cleanup(messageId);
                        return;
                    }
                } else {
                    finalPlayerIds = playerIds;
                }

                const finalMentions = finalPlayerIds.map(uid => `<@${uid}>`);
                const memberList = finalPlayerIds.map((uid, i) => `${i + 1}. <@${uid}>`).join('\n');

                let desc = `ปาร์ตี้เกม: **${gameName}**\n\n👥 **ผู้เล่นที่ยืนยันแล้ว (${finalPlayerIds.length} คน):**\n${memberList}\n\nถึงเวลาเริ่มแล้ว ลุยเลย! 🚀`;
                if (absentMentions.length > 0) desc += `\n\n⚠️ ผู้เล่นที่ไม่ยืนยัน: ${absentMentions.join(' ')}`;

                const alertEmbed = new EmbedBuilder()
                    .setTitle('🚨 แจ้งเตือน: ได้เวลาเริ่มเกมแล้ว')
                    .setDescription(desc)
                    .setColor(game.themeColor);

                await message.channel.send({ content: `🔔 ${finalMentions.join(' ')}`, embeds: [alertEmbed] });

                // Disable check-in button บน reminder message
                const disabledBtn = new ButtonBuilder()
                    .setCustomId(`btn_checkin_${messageId}`)
                    .setLabel('✅ ยืนยันเข้าร่วม')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);
                const rIds = reminderMessageIds.get(messageId) || [];
                for (const rid of rIds) {
                    try {
                        const m = await message.channel.messages.fetch(rid);
                        await m.edit({ components: [new ActionRowBuilder().addComponents(disabledBtn)] });
                    } catch (e) {}
                }

                // DM ทุกคนที่ยืนยัน
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🚨 ได้เวลาเริ่ม ${gameName} แล้ว!`)
                    .setDescription('เข้า server และเตรียมเล่นได้เลยครับ 🚀')
                    .setColor(game.themeColor);
                for (const uid of finalPlayerIds) await _tryDM(message.client, uid, dmEmbed);

                _cleanup(messageId);
                return;
            }

            // ── 5-MIN REMINDER ────────────────────────────────────────────────────
            const { playerIds, standbyIds } = _parsePlayerIds(embed.description);

            // ไม่ครบคน → ยกเลิกทันที ไม่ต้องให้กดยืนยัน
            if (maxPlayers > 0 && currentCount < maxPlayers) {
                if (allMentions.length > 0) {
                    await message.channel.send({
                        content: `${allMentions.join(' ')}\n❌ ปาร์ตี้ **${gameName}** ถูกยกเลิกอัตโนมัติ เนื่องจากผู้เล่นไม่ครบ (${currentCount}/${maxPlayers} คน)`
                    });
                }
                try { await fetchedMsg.delete(); } catch (e) {}
                _cleanup(messageId);
                return;
            }

            // ครบคน → เริ่ม check-in พร้อม list สถานะ
            checkins.set(messageId, new Set());

            const statusLines = playerIds.map((uid, i) => `${i + 1}. <@${uid}> ⏳`).join('\n');

            const checkinBtn = new ButtonBuilder()
                .setCustomId(`btn_checkin_${messageId}`)
                .setLabel('✅ ยืนยันเข้าร่วม')
                .setStyle(ButtonStyle.Success);

            const reminderEmbed = new EmbedBuilder()
                .setTitle('⏳ อีก 5 นาทีจะเริ่มเกม!')
                .setDescription(
                    `ปาร์ตี้เกม: **${gameName}**\n` +
                    `กดยืนยันก่อนเวลา — ผู้ที่ไม่ยืนยันจะถูกตัดออกอัตโนมัติ\n\n` +
                    `**สถานะ (0/${playerIds.length}):**\n${statusLines}`
                )
                .setColor(game.themeColor);

            const sent = await message.channel.send({
                content: `🔔 ${allMentions.join(' ')}`,
                embeds: [reminderEmbed],
                components: [new ActionRowBuilder().addComponents(checkinBtn)]
            });

            const existing = reminderMessageIds.get(messageId) || [];
            existing.push(sent.id);
            reminderMessageIds.set(messageId, existing);
            _persistReminderIds(messageId, existing);

            // DM ทุกคน
            const dmEmbed = new EmbedBuilder()
                .setTitle(`⏳ อีก 5 นาที ปาร์ตี้ ${gameName} จะเริ่ม!`)
                .setDescription('กลับไปที่ server และกดยืนยันเข้าร่วมด้วยนะครับ')
                .setColor(game.themeColor);
            for (const uid of [...playerIds, ...standbyIds]) await _tryDM(message.client, uid, dmEmbed);

        } catch (error) {
            console.error('Error running scheduled job:', error);
        }

        if (isFinal) _cleanup(messageId);
    }

    if (reminderTime > now) {
        const j1 = schedule.scheduleJob(reminderTime, () => executeAlert(false));
        if (j1) jobList.push(j1);
    }
    if (exactTime > now) {
        const j2 = schedule.scheduleJob(exactTime, () => executeAlert(true));
        if (j2) jobList.push(j2);
    }

    if (jobList.length > 0) {
        jobs.set(messageId, jobList);
        console.log(`ตั้งปลุกสำหรับ ${messageId} เวลา ${exactTime.toLocaleString()}`);
        return true;
    }
    return false;
}

function scheduleJob(message, timeStr) {
    const exactTime = getExactTime(timeStr);
    if (!exactTime) { console.log(`รูปแบบเวลาไม่ถูกต้อง: ${timeStr}`); return false; }
    _saveJobToFile(message.id, message.channel.id, exactTime.toISOString());
    return _scheduleJobInternal(message, exactTime);
}

function cancelJob(messageId) {
    _cancelJobInMemory(messageId);
    _cleanup(messageId);
    console.log(`ยกเลิกปลุกสำหรับ ${messageId}`);
}

async function restoreJobs(client) {
    const data = _loadJobsData();
    const now = new Date();
    let restored = 0;

    for (const [messageId, job] of Object.entries(data)) {
        const exactTime = new Date(job.exactTimeISO);
        if (exactTime <= now) { _removeJobFromFile(messageId); console.log(`ข้าม job หมดอายุ: ${messageId}`); continue; }
        try {
            const channel = await client.channels.fetch(job.channelId);
            const message = await channel.messages.fetch(messageId);
            if (message.embeds[0]?.title?.includes('❌')) { _removeJobFromFile(messageId); continue; }

            if (job.checkins?.length > 0) {
                checkins.set(messageId, new Set(job.checkins));
            }
            if (job.reminderMessageIds?.length > 0) {
                reminderMessageIds.set(messageId, job.reminderMessageIds);
            }

            _scheduleJobInternal(message, exactTime);
            restored++;
            console.log(`กู้คืน job สำเร็จ: ${messageId}`);
        } catch (e) {
            console.error(`ไม่สามารถกู้คืน job ${messageId}:`, e.message);
            _removeJobFromFile(messageId);
        }
    }

    if (restored > 0) console.log(`กู้คืน job ทั้งหมด ${restored} รายการ`);
}

module.exports = { scheduleJob, cancelJob, getExactTime, restoreJobs, recordCheckin, getCheckinCount, getReminderMessageIds };
