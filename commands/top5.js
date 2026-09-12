const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchWeeklyStats } = require('../utils/valorantApi');
const { getAllLinks } = require('../utils/playerLinks');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MATCHES = 3; // ต้องเล่น Competitive อย่างน้อยกี่แมตช์ในสัปดาห์นี้ถึงจะติดอันดับ (กันคนเล่นเกมเดียวแล้วได้ K/D สวยหลุดขึ้นที่ 1)
const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top5')
        .setDescription(`Top 5 K/D ประจำสัปดาห์นี้ ของคนที่ /link Riot ID ไว้ (ต้องเล่นอย่างน้อย ${MIN_MATCHES} แมตช์)`),

    async execute(interaction) {
        await interaction.deferReply();

        const links = getAllLinks();
        if (links.length === 0) {
            await interaction.editReply('❌ ยังไม่มีใครในเซิร์ฟ /link Riot ID ไว้เลย');
            return;
        }

        const afterMs = Date.now() - WEEK_MS;
        const results = [];

        // ดึงทีละคนแบบ sequential กันโดน rate limit ของ HenrikDev API (unofficial)
        for (const link of links) {
            try {
                const stats = await fetchWeeklyStats(link.region || 'ap', link.name, link.tag, afterMs);
                if (stats && stats.matches >= MIN_MATCHES) {
                    results.push({ discordId: link.discordId, name: link.name, tag: link.tag, ...stats });
                }
            } catch (e) {
                console.error(`ดึงสถิติสัปดาห์นี้ของ ${link.name}#${link.tag} ไม่สำเร็จ:`, e);
            }
        }

        if (results.length === 0) {
            await interaction.editReply(`❌ ยังไม่มีใครเล่น Competitive ครบ ${MIN_MATCHES} แมตช์ในสัปดาห์นี้เลย ลองเช็คใหม่ทีหลังนะ`);
            return;
        }

        results.sort((a, b) => b.kd - a.kd);
        const top5 = results.slice(0, 5);

        const lines = top5.map((r, i) => {
            const medal = MEDALS[i] || `${i + 1}.`;
            return `${medal} <@${r.discordId}> — **${r.kd.toFixed(2)} K/D** (${r.kills}/${r.deaths}/${r.assists}) • ${r.wins}W ${r.losses}L • ${r.matches} แมตช์`;
        });

        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 5 K/D ประจำสัปดาห์นี้')
            .setDescription(lines.join('\n'))
            .setColor(0xFFD700)
            .setFooter({ text: `นับเฉพาะ Competitive ย้อนหลัง 7 วัน (สูงสุด 10 แมตช์ล่าสุด/คน) • ต้องเล่นอย่างน้อย ${MIN_MATCHES} แมตช์ถึงติดอันดับ` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
