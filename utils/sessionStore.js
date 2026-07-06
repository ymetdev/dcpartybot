// เก็บ session ของปาร์ตี้ที่เริ่มเล่นแล้ว รอ host กดจบเพื่อสรุปผล
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '..', 'active_sessions.json');

function _load() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch (e) { console.error('Error reading sessions file:', e); }
    return {};
}

function _save(data) {
    try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('Error saving sessions file:', e); }
}

function createSession(key, session) {
    const data = _load();
    data[key] = session;
    _save(data);
}

function getSession(key) {
    return _load()[key] || null;
}

function removeSession(key) {
    const data = _load();
    if (!(key in data)) return;
    delete data[key];
    _save(data);
}

module.exports = { createSession, getSession, removeSession };
