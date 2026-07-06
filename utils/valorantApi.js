// Wrapper บาง ๆ รอบ HenrikDev API (unofficial Valorant API) — ไม่ใช่ official Riot API
// ต้องมี HENRIKDEV_API_KEY ใน .env (ขอฟรีได้จาก dashboard ของ HenrikDev ผ่าน Discord ของเขา)

const BASE_URL = 'https://api.henrikdev.xyz';

function _headers() {
    const headers = { Accept: 'application/json' };
    if (process.env.HENRIKDEV_API_KEY) headers.Authorization = process.env.HENRIKDEV_API_KEY;
    return headers;
}

async function fetchAccount(name, tag) {
    const res = await fetch(`${BASE_URL}/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers: _headers() });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
}

// หาแมตช์ Competitive ล่าสุดที่เริ่มหลังเวลาที่ปาร์ตี้เริ่ม (afterMs) แบบ best-effort
// เดาจาก match history เท่านั้น ไม่มีทาง verify 100% ว่าเป็นแมตช์เดียวกับปาร์ตี้นี้จริง
// ข้ามโหมดอื่น (Deathmatch, Unrated, Custom ฯลฯ) ไปเลย เพราะปนกับแมตช์วอร์มอัพ/ซ้อมของแต่ละคน
async function fetchRecentMatchStats(region, name, tag, afterMs) {
    const res = await fetch(
        `${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=10`,
        { headers: _headers() }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json?.data || [];
    const targetKey = `${name}#${tag}`.toLowerCase();

    for (const match of matches) {
        if (match.metadata?.mode?.toLowerCase() !== 'competitive') continue;

        const startedMs = (match.metadata?.game_start ?? 0) * 1000;
        if (startedMs < afterMs) continue;

        const me = (match.players?.all_players || []).find(
            p => `${p.name}#${p.tag}`.toLowerCase() === targetKey
        );
        if (!me) continue;

        return {
            matchId: match.metadata?.matchid || match.metadata?.match_id || null,
            map: match.metadata?.map || '?',
            mode: match.metadata?.mode || '?',
            agent: me.character || me.agent?.name || me.agent || '?',
            kills: me.stats?.kills ?? 0,
            deaths: me.stats?.deaths ?? 0,
            assists: me.stats?.assists ?? 0,
            score: me.stats?.score ?? 0,
        };
    }
    return null;
}

module.exports = { fetchAccount, fetchRecentMatchStats };
