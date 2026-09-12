const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { fetchAccount, fetchCurrentRank } = require('../utils/valorantApi');
const { setLink } = require('../utils/playerLinks');

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
        .setName('link-admin')
        .setDescription('(Admin) ผูก Riot ID ให้สมาชิกคนอื่นแทนตัวเขาเอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(o => o.setName('user').setDescription('สมาชิกที่จะผูก Riot ID ให้').setRequired(true))
        .addStringOption(o => o.setName('riotid').setDescription('Riot ID เช่น PlayerName#1234').setRequired(true))
        .addStringOption(o => o.setName('region').setDescription('เซิร์ฟเวอร์ที่เล่น (ค่าเริ่มต้น Asia Pacific)').addChoices(...REGIONS)),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: '❌ ต้องมีสิทธิ์ Manage Server ถึงจะใช้คำสั่งนี้ได้', ephemeral: true });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const riotId = interaction.options.getString('riotid');
        const region = interaction.options.getString('region') || 'ap';

        const m = riotId.match(/^(.+)#(\w+)$/);
        if (!m) {
            await interaction.reply({ content: '❌ รูปแบบไม่ถูกต้อง ต้องเป็น Name#Tag เช่น PlayerName#1234', ephemeral: true });
            return;
        }
        const [, name, tag] = m;

        await interaction.deferReply({ ephemeral: true });

        let account;
        try {
            account = await fetchAccount(name, tag);
        } catch (e) {
            await interaction.editReply('❌ ดึงข้อมูลจาก Valorant API ไม่สำเร็จ ลองใหม่อีกครั้ง');
            return;
        }
        if (!account) {
            await interaction.editReply('❌ ไม่พบบัญชีนี้ ตรวจสอบ Riot ID อีกครั้ง');
            return;
        }

        setLink(targetUser.id, account.name || name, account.tag || tag, region);

        let rankLine = '';
        try {
            const rank = await fetchCurrentRank(region, account.name || name, account.tag || tag);
            if (rank) rankLine = `\n🏅 อันดับปัจจุบัน: **${rank.tierName}** (${rank.rr} RR)`;
        } catch (e) { /* ไม่บล็อกการผูกบัญชีถ้าดึงอันดับไม่สำเร็จ */ }

        await interaction.editReply(`✅ ผูกบัญชี **${account.name}#${account.tag}** ให้ <@${targetUser.id}> เรียบร้อย${rankLine}`);
    }
};
