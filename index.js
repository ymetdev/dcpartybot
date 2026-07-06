require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Dummy Web Server สำหรับกันเว็บพังบน Render.com
const app = express();
app.get('/', (req, res) => res.send('PartyBot is running! 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

client.commands = new Collection();

// โหลด commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] คำสั่งใน ${filePath} ขาด properties 'data' หรือ 'execute' ที่จำเป็น`);
        }
    }
}

client.once(Events.ClientReady, async c => {
    console.log(`✅ พร้อมทำงานแล้ว! ล็อกอินในชื่อ ${c.user.tag}`);
    const { restoreJobs } = require('./scheduler');
    await restoreJobs(c);
});

client.on(Events.InteractionCreate, async interaction => {
    // แยกส่วนจัดการ Command กับ Button ออกจากกัน
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`ไม่พบคำสั่ง ${interaction.commandName}`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'เกิดข้อผิดพลาดในการรันคำสั่งนี้!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'เกิดข้อผิดพลาดในการรันคำสั่งนี้!', ephemeral: true });
            }
        }
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        // รอรับ Event กดปุ่ม หรือเลือกเมนู
        const { handleButtonInteraction } = require('./events/buttonHandler');
        if (handleButtonInteraction) {
            await handleButtonInteraction(interaction);
        }
    } else if (interaction.isModalSubmit()) {
        // รอรับ Event กด Submit Modal
        const { handleModalInteraction } = require('./events/modalHandler');
        if (handleModalInteraction) {
            await handleModalInteraction(interaction);
        }
    } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'schedule') {
            const { GAMES } = require('./config/games');
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const filtered = GAMES.filter(g => g.name.toLowerCase().includes(focusedValue));
            await interaction.respond(filtered.map(g => ({ name: g.name, value: g.name })));
        }
    }
});

client.login(process.env.BOT_TOKEN);
