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

// ดึงแมตช์ Competitive ล่าสุด 1 เกม ของคนคนนี้ พร้อมสถิติในเกมนั้น
async function fetchLastMatch(region, name, tag) {
    const res = await fetch(
        `${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=10`,
        { headers: _headers() }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json?.data || [];
    const match = matches.find(m => m.metadata?.mode?.toLowerCase() === 'competitive');
    if (!match) return null;

    const targetKey = `${name}#${tag}`.toLowerCase();
    const allPlayers = match.players?.all_players || [];
    const me = allPlayers.find(p => `${p.name}#${p.tag}`.toLowerCase() === targetKey);
    if (!me) return null;

    const teamKey = (me.team || me.team_id || '').toLowerCase();
    const team = match.teams?.[teamKey];

    return {
        matchId: match.metadata?.matchid || match.metadata?.match_id || null,
        map: match.metadata?.map || '?',
        mode: match.metadata?.mode || '?',
        agent: me.character || me.agent?.name || me.agent || '?',
        kills: me.stats?.kills ?? 0,
        deaths: me.stats?.deaths ?? 0,
        assists: me.stats?.assists ?? 0,
        score: me.stats?.score ?? 0,
        won: team ? !!team.has_won : null,
    };
}

// ดึงอันดับ Competitive ปัจจุบันของคนคนนี้
async function fetchCurrentRank(region, name, tag) {
    const res = await fetch(
        `${BASE_URL}/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        { headers: _headers() }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const cd = json?.data?.current_data;
    if (!cd || !cd.currenttierpatched) return null;

    return {
        tierName: cd.currenttierpatched,
        rr: cd.ranking_in_tier ?? 0,
        mmrChange: cd.mmr_change_to_last_game ?? 0,
        iconUrl: cd.images?.small || cd.images?.large || null,
    };
}

// สรุปสถิติ Competitive ของคนคนนี้ทุกแมตช์ที่เริ่มหลัง afterMs (ใช้ทำ Weekly Leaderboard)
// หมายเหตุ: จำกัดที่ 10 แมตช์ล่าสุดเหมือน fetchLastMatch/fetchCompetitiveMatchesSince —
// ถ้าใครเล่น Competitive เกิน 10 เกมในสัปดาห์นั้น แมตช์เก่ากว่านั้นจะไม่ถูกนับ
async function fetchWeeklyStats(region, name, tag, afterMs) {
    const res = await fetch(
        `${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=10`,
        { headers: _headers() }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json?.data || [];
    const targetKey = `${name}#${tag}`.toLowerCase();

    let kills = 0, deaths = 0, assists = 0, wins = 0, losses = 0, matchesCounted = 0;

    for (const match of matches) {
        if (match.metadata?.mode?.toLowerCase() !== 'competitive') continue;

        const startedMs = (match.metadata?.game_start ?? 0) * 1000;
        if (startedMs < afterMs) continue;

        const allPlayers = match.players?.all_players || [];
        const me = allPlayers.find(p => `${p.name}#${p.tag}`.toLowerCase() === targetKey);
        if (!me) continue;

        const teamKey = (me.team || me.team_id || '').toLowerCase();
        const team = match.teams?.[teamKey];

        kills += me.stats?.kills ?? 0;
        deaths += me.stats?.deaths ?? 0;
        assists += me.stats?.assists ?? 0;
        if (team?.has_won === true) wins++;
        else if (team?.has_won === false) losses++;
        matchesCounted++;
    }

    if (matchesCounted === 0) return null;

    return {
        matches: matchesCounted,
        kills, deaths, assists, wins, losses,
        kd: deaths > 0 ? kills / deaths : kills,
    };
}

module.exports = { fetchAccount, fetchCompetitiveMatchesSince, fetchLastMatch, fetchCurrentRank, fetchWeeklyStats };
