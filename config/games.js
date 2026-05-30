const GAMES = [
    {
        name: 'Valorant',
        themeColor: '#FF4655',
        hasRoles: true,
        roles: [
            { label: 'Duelist', value: 'Duelist', emoji: '⚔️' },
            { label: 'Initiator', value: 'Initiator', emoji: '👁️' },
            { label: 'Controller', value: 'Controller', emoji: '💨' },
            { label: 'Sentinel', value: 'Sentinel', emoji: '🛡️' },
            { label: 'Flex', value: 'Flex', emoji: '🔄' },
        ]
    },
    {
        name: 'Minecraft',
        themeColor: '#4ECCA3',
        hasRoles: false,
        roles: []
    }
];

function getGameConfig(gameName) {
    if (!gameName) return { name: '', themeColor: '#7289DA', hasRoles: false, roles: [] };
    const lower = gameName.toLowerCase();
    return GAMES.find(g => lower.includes(g.name.toLowerCase()))
        || { name: gameName, themeColor: '#7289DA', hasRoles: false, roles: [] };
}

module.exports = { GAMES, getGameConfig };
