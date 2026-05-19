const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('เปิดฟอร์มสร้างตี้หาคนเล่นเกม'),
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('modal_create_party')
            .setTitle('สร้างปาร์ตี้ใหม่');

        const gameInput = new TextInputBuilder()
            .setCustomId('input_game')
            .setLabel('ชื่อเกม')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('เช่น Valorant, ROV')
            .setRequired(true);

        const timeInput = new TextInputBuilder()
            .setCustomId('input_time')
            .setLabel('เวลา (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('เช่น 20:30')
            .setRequired(true);

        const playersInput = new TextInputBuilder()
            .setCustomId('input_players')
            .setLabel('จำนวนผู้เล่นสูงสุด (รวมตัวเอง)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('เช่น 5')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(gameInput);
        const row2 = new ActionRowBuilder().addComponents(timeInput);
        const row3 = new ActionRowBuilder().addComponents(playersInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    },
};
