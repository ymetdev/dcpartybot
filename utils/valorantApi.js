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

// หาแมตช์ Competitive ทั้งหมดของคนคนนี้ (ใช้เป็น Host) ที่เริ่มหลัง afterMs
// คืน roster เต็มของทุกแมตช์ (ทั้งสองฝั่ง) เพื่อเอาไปจับคู่หาเพื่อนร่วมทีมจากแมตช์เดียวกันจริงๆ
// แทนที่จะให้แต่ละคน query ประวัติตัวเองแยกกัน ซึ่งเสี่ยงได้แมตช์คนละอันที่ไม่เกี่ยวกับปาร์ตี้นี้เลย
// ข้ามโหมดอื่น (Deathmatch, Unrated, Custom ฯลฯ) ไปเลย เพราะปนกับแมตช์วอร์มอัพ/ซ้อมของแต่ละคน
async function fetchCompetitiveMatchesSince(region, name, tag, afterMs) {
    const res = await fetch(
        `${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=10`,
        { headers: _headers() }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const matches = json?.data || [];
    const targetKey = `${name}#${tag}`.toLowerCase();

    const result = [];
    for (const match of matches) {
        if (match.metadata?.mode?.toLowerCase() !== 'competitive') continue;

        const startedMs = (match.metadata?.game_start ?? 0) * 1000;
        if (startedMs < afterMs) continue;

        const allPlayers = match.players?.all_players || [];
        const me = allPlayers.find(p => `${p.name}#${p.tag}`.toLowerCase() === targetKey);
        if (!me) continue;

        result.push({
            matchId: match.metadata?.matchid || match.metadata?.match_id || null,
            map: match.metadata?.map || '?',
            myTeam: me.team || me.team_id || null,
            players: allPlayers.map(p => ({
                name: p.name,
                tag: p.tag,
                team: p.team || p.team_id || null,
                agent: p.character || p.agent?.name || p.agent || '?',
                kills: p.stats?.kills ?? 0,
                deaths: p.stats?.deaths ?? 0,
                assists: p.stats?.assists ?? 0,
            })),
        });
    }
    return result;
}

module.exports = { fetchAccount, fetchCompetitiveMatchesSince };
