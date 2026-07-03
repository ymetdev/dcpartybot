const { SlashCommandBuilder } = require('discord.js');
const { fetchAccount } = require('../utils/valorantApi');
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
        .setName('link')
        .setDescription('ผูก Riot ID เพื่อให้บอทดึงสถิติ Valorant สรุปให้หลังจบปาร์ตี้ (ไม่บังคับ)')
        .addStringOption(o => o.setName('riotid').setDescription('Riot ID เช่น PlayerName#1234').setRequired(true))
        .addStringOption(o => o.setName('region').setDescription('เซิร์ฟเวอร์ที่เล่น (ค่าเริ่มต้น Asia Pacific)').addChoices(...REGIONS)),

    async execute(interaction) {
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

        setLink(interaction.user.id, account.name || name, account.tag || tag, region);
        await interaction.editReply(`✅ ผูกบัญชี **${account.name}#${account.tag}** เรียบร้อย — บอทจะดึงสถิติให้อัตโนมัติหลังจบปาร์ตี้ Valorant`);
    }
};
