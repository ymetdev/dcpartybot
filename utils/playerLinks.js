const fs = require('fs');
const path = require('path');

const LINKS_FILE = path.join(__dirname, '..', 'player_links.json');

function _load() {
    try {
        if (fs.existsSync(LINKS_FILE)) return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    } catch (e) { console.error('Error reading player links file:', e); }
    return {};
}

function _save(data) {
    try { fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving player links file:', e); }
}

function getLink(discordId) {
    return _load()[discordId] || null;
}

function setLink(discordId, name, tag, region) {
    const data = _load();
    data[discordId] = { name, tag, region };
    _save(data);
}

module.exports = { getLink, setLink };
