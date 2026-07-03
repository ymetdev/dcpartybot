// เช็คแมตช์ใหม่ของผู้เล่นที่ /link ไว้เป็นระยะ แล้วโพสต์สรุปให้อัตโนมัติทุกตาที่จบ
// จนกว่า host จะกดปุ่ม "จบ Session" หรือครบเพดานเวลาสำรอง
const { EmbedBuilder } = require('discord.js');
const { getLink } = require('./playerLinks');
const { fetchRecentMatchStats } = require('./valorantApi');
const { getSession, createSession, removeSession, listSessions } = require('./sessionStore');

const POLL_INTERVAL_MS = 2 * 60 * 1000; // เล่นกันไม่เกิน 1 ปาร์ตี้พร้อมกัน เช็คถี่ได้โดยไม่ชน rate limit (30 req/min)
const MAX_DURATION_MS = 6 * 60 * 60 * 1000; // กันไว้เผื่อ host ลืมกดจบ

const pollers = new Map(); // sessionKey -> intervalId

async function _postRoundSummary(client, session, newMatches) {
    const channel = await client.channels.fetch(session.channelId);
    const lines = newMatches.map(({ uid, stats }) =>
        `<@${uid}> — **${stats.agent}** | ${stats.kills}/${stats.deaths}/${stats.assists} (Score ${stats.score})`
    );
    const embed = new EmbedBuilder()
        .setTitle(`📊 สรุปสถิติตาล่าสุด — ${session.gameName}`)
        .setDescription(lines.join('\n'))
        .setColor(0x5865F2)
        .setFooter({ text: 'ข้อมูลจาก HenrikDev API (unofficial) — อัปเดตอัตโนมัติทุกตาที่จบ กดปุ่ม "จบ Session" เมื่อเลิกเล่นแล้ว' });
    await channel.send({ embeds: [embed] });
}

async function _poll(client, sessionKey) {
    const session = getSession(sessionKey);
    if (!session) { stopPoller(sessionKey); return; }

    if (Date.now() - session.startedAtMs > MAX_DURATION_MS) {
        await endSession(client, sessionKey, 'ครบ 6 ชั่วโมง หยุดติดตามอัตโนมัติ');
        return;
    }

    const newMatches = [];
    for (const uid of session.playerIds) {
        const link = getLink(uid);
        if (!link) continue;
        try {
            const stats = await fetchRecentMatchStats(link.region, link.name, link.tag, session.startedAtMs);
            if (!stats || !stats.matchId) continue;
            if (session.lastMatchIds[uid] === stats.matchId) continue; // ตานี้เคยรายงานไปแล้ว
            session.lastMatchIds[uid] = stats.matchId;
            newMatches.push({ uid, stats });
        } catch (e) {
            console.error(`poll: ดึงสถิติของ ${uid} ไม่สำเร็จ:`, e.message);
        }
    }

    if (newMatches.length > 0) {
        createSession(sessionKey, session); // persist lastMatchIds ที่อัปเดตแล้ว
        try { await _postRoundSummary(client, session, newMatches); } catch (e) { console.error('post round summary error:', e); }
    }
}

function startPoller(client, sessionKey) {
    if (pollers.has(sessionKey)) return; // รันอยู่แล้ว (เช่นตอน restore)
    const intervalId = setInterval(() => _poll(client, sessionKey), POLL_INTERVAL_MS);
    pollers.set(sessionKey, intervalId);
}

function stopPoller(sessionKey) {
    const intervalId = pollers.get(sessionKey);
    if (intervalId) clearInterval(intervalId);
    pollers.delete(sessionKey);
}

async function endSession(client, sessionKey, reason = 'host กดจบ') {
    const session = getSession(sessionKey);
    stopPoller(sessionKey);
    removeSession(sessionKey);
    if (!session) return;

    try {
        const channel = await client.channels.fetch(session.channelId);
        if (session.alertMessageId) {
            try {
                const msg = await channel.messages.fetch(session.alertMessageId);
                await msg.edit({ components: [] });
            } catch (e) {}
        }
        await channel.send(`🛑 หยุดติดตามสถิติปาร์ตี้ **${session.gameName}** แล้ว (${reason})`);
    } catch (e) {}
}

function restoreAll(client) {
    const sessions = listSessions();
    const keys = Object.keys(sessions);
    for (const key of keys) startPoller(client, key);
    if (keys.length > 0) console.log(`กู้คืนการติดตามสถิติ ${keys.length} session`);
}

module.exports = { startPoller, stopPoller, endSession, restoreAll };
