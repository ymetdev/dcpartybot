const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchAccount, fetchLastMatch } = require('../utils/valorantApi');
const { getLink } = require('../utils/playerLinks');

const REGIONS = [
    { name: 'Asia Pacific (AP)', value: 'ap' },
    { name: 'North America (NA)', value: 'na' },
    { name: 'Europe (EU)', value: 'eu' },
    { name: 'Korea (KR)', value: 'kr' },
    { name: 'Latin America (LATAM)', value: 'latam' },
    { name: 'Brazil (BR)', value: 'br' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('ดูสถิติแมตช์ Competitive ล่าสุดของตัวเองหรือคนอื่น (Valorant)')
        .addUserOption(o => o.setName('user').setDescription('ดูของคนอื่น (ต้องเคย /link ไว้)'))
        .addStringOption(o => o.setName('riotid').setDescription('ระบุ Riot ID ตรง ๆ เช่น PlayerName#1234 (ไม่ต้อง /link)'))
        .addStringOption(o => o.setName('region').setDescription('เซิร์ฟเวอร์ที่เล่น (ใช้คู่กับ riotid, ค่าเริ่มต้น Asia Pacific)').addChoices(...REGIONS)),

    async execute(interaction) {
        const riotId = interaction.options.getString('riotid');
        const targetUser = interaction.options.getUser('user');

        let name, tag, region;

        if (riotId) {
            const m = riotId.match(/^(.+)#(\w+)$/);
            if (!m) {
                await interaction.reply({ content: '❌ รูปแบบ Riot ID ไม่ถูกต้อง ต้องเป็น Name#Tag เช่น PlayerName#1234', ephemeral: true });
                return;
            }
            [, name, tag] = m;
            region = interaction.options.getString('region') || 'ap';
        } else {
            const lookupUser = targetUser || interaction.user;
            const link = getLink(lookupUser.id);
            if (!link) {
                const who = targetUser ? `<@${targetUser.id}>` : 'คุณ';
                await interaction.reply({ content: `❌ ${who}ยังไม่ได้ /link Riot ID ไว้ — ลองระบุ \`riotid\` ตรง ๆ แทนได้`, ephemeral: true });
                return;
            }
            name = link.name;
            tag = link.tag;
            region = link.region || 'ap';
        }

        await interaction.deferReply();

        let account;
        try {
            account = await fetchAccount(name, tag);
        } catch (e) {
            await interaction.editReply('❌ ดึงข้อมูลจาก Valorant API ไม่สำเร็จ ลองใหม่อีกครั้ง');
            return;
        }
        if (!account) {
            await interaction.editReply('❌ ไม่พบบัญชี Riot ID นี้ ตรวจสอบชื่ออีกครั้ง');
            return;
        }

        let match;
        try {
            match = await fetchLastMatch(region, account.name || name, account.tag || tag);
        } catch (e) {
            await interaction.editReply('❌ ดึงข้อมูลแมตช์จาก Valorant API ไม่สำเร็จ ลองใหม่อีกครั้ง');
            return;
        }
        if (!match) {
            await interaction.editReply(`❌ ไม่พบแมตช์ Competitive ล่าสุดของ **${account.name}#${account.tag}**`);
            return;
        }

        const kd = match.deaths > 0 ? (match.kills / match.deaths).toFixed(2) : match.kills.toFixed(2);
        const resultText = match.won === null ? '' : (match.won ? '🟢 ชนะ' : '🔴 แพ้');

        const embed = new EmbedBuilder()
            .setTitle(`สถิติแมตช์ Competitive ล่าสุดของ ${account.name}#${account.tag}`)
            .setColor(match.won === null ? 0x5865F2 : (match.won ? 0x57F287 : 0xED4245))
            .addFields(
                { name: 'แมพ', value: match.map, inline: true },
                { name: 'ผลการแข่ง', value: resultText || '-', inline: true },
                { name: 'ตัวละคร', value: match.agent, inline: true },
                { name: 'K/D/A', value: `${match.kills}/${match.deaths}/${match.assists} (${kd})`, inline: true },
                { name: 'คะแนน', value: `${match.score}`, inline: true },
            );

        await interaction.editReply({ embeds: [embed] });
    }
};
