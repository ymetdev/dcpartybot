const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const { getGameConfig } = require('./config/games');
const { createSession } = require('./utils/sessionStore');

const jobs = new Map();
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
    data[messageId] = { channelId, exactTimeISO };
    try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving jobs file:', e); }
}

function _removeJobFromFile(messageId) {
    const data = _loadJobsData();
    if (!data[messageId]) return;
    delete data[messageId];
    try { fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving jobs file:', e); }
}

// ─── In-memory helpers ────────────────────────────────────────────────────────

function _cancelJobInMemory(messageId) {
    const job = jobs.get(messageId);
    if (job) { job.cancel(); jobs.delete(messageId); }
}

function _cleanup(messageId) {
    _removeJobFromFile(messageId);
    jobs.delete(messageId);
}

function getExactTime(timeStr) {
    if (!timeStr.match(/^(\d{1,2}):(\d{2})$/)) return null;
    const t = moment.tz(timeStr, 'HH:mm', 'Asia/Bangkok');
    if (t.isBefore(moment.tz('Asia/Bangkok'))) t.add(1, 'day');
    return t.toDate();
}

// ─── Core scheduler ───────────────────────────────────────────────────────────
// ถึงเวลาเริ่ม: ครบคน -> ping ทุกคนเริ่มเลย, ไม่ครบคน -> ยกเลิกอัตโนมัติ (ไม่มีขั้นเช็คอินคั่นแล้ว)

function _scheduleJobInternal(message, exactTime) {
    const messageId = message.id;
    _cancelJobInMemory(messageId);

    if (exactTime <= new Date()) return false;

    async function _tryDM(client, userId, dmEmbed) {
        try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [dmEmbed] });
        } catch (e) {}
    }

    async function executeStart() {
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

            // ดึงรายชื่อผู้เล่นตัวจริงจาก description (ไม่รวมตัวสำรองที่ยังไม่ได้เลื่อนขึ้นมา)
            const playerIds = [];
            let mode = 'header';
            for (const line of embed.description.split('\n')) {
                const t = line.trim();
                if (t.startsWith('**ผู้เล่น')) { mode = 'players'; continue; }
                if (t.startsWith('**ตัวสำรอง')) { mode = 'standbys'; continue; }
                if (mode === 'players') {
                    const m = t.match(/<@(\d+)>/);
                    if (m) playerIds.push(m[1]);
                }
            }
            const playerMentions = playerIds.map(uid => `<@${uid}>`);

            const isPartyFull = maxPlayers === 0 || currentCount >= maxPlayers;

            if (!isPartyFull) {
                if (playerMentions.length > 0) {
                    await message.channel.send({
                        content: `${playerMentions.join(' ')}\n❌ ปาร์ตี้ **${gameName}** ถูกยกเลิกอัตโนมัติ เนื่องจากผู้เล่นไม่ครบ (${currentCount}/${maxPlayers} คน)`
                    });
                }
                try { await fetchedMsg.delete(); } catch (e) {}
                _cleanup(messageId);
                return;
            }

            const memberList = playerIds.map((uid, i) => `${i + 1}. <@${uid}>`).join('\n');
            const desc = `ปาร์ตี้เกม: **${gameName}**\n\n👥 **ผู้เล่น (${playerIds.length} คน):**\n${memberList}\n\nถึงเวลาเริ่มแล้ว ลุยเลย! 🚀`;

            const alertEmbed = new EmbedBuilder()
                .setTitle('🚨 แจ้งเตือน: ได้เวลาเริ่มเกมแล้ว')
                .setDescription(desc)
                .setColor(game.themeColor);

            // เฉพาะ Valorant เท่านั้นที่ดึงสถิติได้ (ผ่าน HenrikDev API แบบไม่เป็นทางการ)
            // ใช้ messageId เดิมเป็น session key เพราะรู้อยู่แล้วโดยไม่ต้องรอ id ของ alert message
            const isValorant = gameName.toLowerCase().includes('valorant');
            let components = [];
            let hostId = null;
            if (isValorant) {
                const hostMatch = embed.description.match(/👑 <@(\d+)>/);
                hostId = hostMatch ? hostMatch[1] : playerIds[0];
                components = [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_summary_${messageId}`)
                        .setLabel('📊 สรุปผล & จบ Session')
                        .setStyle(ButtonStyle.Primary)
                )];
            }

            await message.channel.send({ content: `🔔 ${playerMentions.join(' ')}`, embeds: [alertEmbed], components });

            if (isValorant) {
                createSession(messageId, { gameName, hostId, playerIds, startedAtMs: Date.now() });
            }

            // เกมเริ่มแล้ว โพสต์ปาร์ตี้ (banner+ปุ่ม) หมดหน้าที่ ลบทิ้งกันแชทรก
            try { await fetchedMsg.delete(); } catch (e) {}

            const dmEmbed = new EmbedBuilder()
                .setTitle(`🚨 ได้เวลาเริ่ม ${gameName} แล้ว!`)
                .setDescription('เข้า server และเตรียมเล่นได้เลยครับ 🚀')
                .setColor(game.themeColor);
            for (const uid of playerIds) await _tryDM(message.client, uid, dmEmbed);

        } catch (error) {
            console.error('Error running scheduled job:', error);
        }
        _cleanup(messageId);
    }

    const job = schedule.scheduleJob(exactTime, executeStart);
    if (job) {
        jobs.set(messageId, job);
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

module.exports = { scheduleJob, cancelJob, getExactTime, restoreJobs };
