const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// ฝังฟอนต์ภาษาไทยเพื่อแก้ปัญหากรอบสี่เหลี่ยมบน Linux (Render)
try {
    registerFont(path.join(__dirname, '../assets/fonts/NotoSansThai-Regular.ttf'), { family: 'Noto Sans Thai' });
    registerFont(path.join(__dirname, '../assets/fonts/NotoSansThai-Bold.ttf'), { family: 'Noto Sans Thai', weight: 'bold' });
} catch (e) {
    console.error('ไม่สามารถโหลดฟอนต์ภาษาไทยได้', e);
}

// โหลดรูปภาพพื้นหลังล่วงหน้าเพื่อลดเวลาประมวลผล
let bgValorant = null;
let bgDefault = null;
try {
    const valoPath = path.join(__dirname, '../assets/backgrounds/valorant.png');
    const defaultPath = path.join(__dirname, '../assets/backgrounds/default.png');
    if (fs.existsSync(valoPath)) bgValorant = fs.readFileSync(valoPath);
    if (fs.existsSync(defaultPath)) bgDefault = fs.readFileSync(defaultPath);
} catch (e) {
    console.error('ไม่สามารถโหลดรูปภาพพื้นหลังได้', e);
}

const ROLE_COLORS = {
    'Duelist': '#FF4655',
    'Initiator': '#B8B28D',
    'Controller': '#4ECCA3',
    'Sentinel': '#F39C12',
    'Flex': '#9B59B6'
};

const ROLE_LETTERS = {
    'Duelist': 'D',
    'Initiator': 'I',
    'Controller': 'C',
    'Sentinel': 'S',
    'Flex': 'F'
};

const loadedIconsCache = {};
async function getRoleIcon(roleName) {
    const roleKey = roleName.toLowerCase();
    if (loadedIconsCache[roleKey]) return loadedIconsCache[roleKey];
    
    const iconPath = path.join(__dirname, `../assets/icons/${roleKey}.png`);
    if (fs.existsSync(iconPath)) {
        try {
            const img = await loadImage(iconPath);
            loadedIconsCache[roleKey] = img;
            return img;
        } catch (e) {
            console.error(`ไม่สามารถโหลดไอคอน ${roleName}:`, e);
        }
    }
    return null;
}

async function generatePartyImage(game, time, maxPlayers, playersArray, standbysArray) {
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const isValorant = game.toLowerCase().includes('valorant') || game.includes('วาโล');
    const themeColor = isValorant ? '#FF4655' : '#4ECCA3';

    // 1. วาดรูปพื้นหลัง (Dynamic Background)
    ctx.fillStyle = '#0F1115';
    ctx.fillRect(0, 0, width, height);
    try {
        let bgBuffer = isValorant ? bgValorant : bgDefault;
        if (bgBuffer) {
            const bgImage = await loadImage(bgBuffer);
            ctx.drawImage(bgImage, 0, 0, width, height);
            // สร้าง Filter มืดๆ ทับไม่ให้รูปกวนตัวหนังสือ
            ctx.fillStyle = 'rgba(15, 17, 21, 0.75)';
            ctx.fillRect(0, 0, width, height);
        }
    } catch (e) {}

    // เส้นขอบสีธีมพรีเมียมด้านบน
    ctx.fillStyle = themeColor;
    ctx.fillRect(0, 0, width, 8);

    // 2. ตัวบ่งชี้มุมบน (Header Indicators)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('▪  LOBBY  ▪', 35, 35);

    ctx.fillStyle = themeColor;
    ctx.textAlign = 'right';
    ctx.fillText(`⌖  ${playersArray.length}/${maxPlayers} PLAYERS`, width - 35, 35);

    // 3. ชื่อล็อบบี้เกมสไตล์ Sci-Fi (Lobby Title)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    const spacedGame = game.toUpperCase().split('').join(' ');
    ctx.fillText(`˯   ${spacedGame}   ˯`, width / 2, 75);

    // 4. ข้อความหัวข้อเวลา
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('MATCH STARTS IN', width / 2, 122);

    // 5. แผงเวลาตัดมุมแบบ Sci-Fi (Slanted Time Board)
    const tbX = 260;
    const tbY = 142;
    const tbW = 280;
    const tbH = 56;

    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';

    ctx.beginPath();
    // ตัดมุมบนซ้าย
    ctx.moveTo(tbX + 15, tbY);
    ctx.lineTo(tbX + tbW, tbY);
    // ตัดมุมล่างขวา
    ctx.lineTo(tbX + tbW - 15, tbY + tbH);
    ctx.lineTo(tbX, tbY + tbH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // วาดไอคอนนาฬิกาเวกเตอร์และตัวเลขเวลาด้านในแผง
    const timeValText = `${time}`;
    ctx.font = 'bold 32px sans-serif';
    const valWidth = ctx.measureText(timeValText).width;
    ctx.font = 'bold 18px "Noto Sans Thai", sans-serif';
    const labelWidth = ctx.measureText(' น.').width;

    const totalContentW = 22 + 12 + valWidth + labelWidth; // 22px คือไอคอนนาฬิกา, 12px ระยะห่าง
    const startC = tbX + (tbW - totalContentW) / 2;

    const cx = startC + 10;
    const cy = tbY + 28;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();

    // เข็มนาฬิกา
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.stroke();

    // ตัวเลขเวลาหลัก
    ctx.fillStyle = themeColor;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(timeValText, startC + 32, tbY + 38);

    // หน่วย "น."
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px "Noto Sans Thai", sans-serif';
    ctx.fillText(' น.', startC + 32 + valWidth, tbY + 35);
    ctx.textAlign = 'center'; // reset alignment

    // 6. วาดเส้นเฉียงตกแต่งข้างแผงเวลา (Slanted dashes)
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2;
    const dashY = tbY + 18;
    // ฝั่งซ้าย (\\\\)
    for (let j = 0; j < 4; j++) {
        const dx = tbX - 45 + j * 8;
        ctx.beginPath();
        ctx.moveTo(dx, dashY + 12);
        ctx.lineTo(dx + 6, dashY - 2);
        ctx.stroke();
    }
    // ฝั่งขวา (////)
    for (let j = 0; j < 4; j++) {
        const dx = tbX + tbW + 15 + j * 8;
        ctx.beginPath();
        ctx.moveTo(dx, dashY - 2);
        ctx.lineTo(dx + 6, dashY + 12);
        ctx.stroke();
    }

    // 7. วาดการ์ดผู้เล่นแนวตั้งสไตล์ Sci-Fi (Lobby Player Cards)
    const cardWidth = 106;
    const cardHeight = 160;
    const gap = 16;
    const totalCardsWidth = (maxPlayers * cardWidth) + ((maxPlayers - 1) * gap);
    const startX = (width - totalCardsWidth) / 2;
    const cardY = 225;

    // ฟังก์ชันวาดเส้นการ์ดตัดมุม
    function drawCardOutline(context, x, y, w, h) {
        context.beginPath();
        context.moveTo(x + 10, y);
        context.lineTo(x + w, y);
        context.lineTo(x + w, y + h - 10);
        context.lineTo(x + w - 10, y + h);
        context.lineTo(x, y + h);
        context.lineTo(x, y + 10);
        context.closePath();
    }

    for (let i = 0; i < maxPlayers; i++) {
        const cardX = startX + i * (cardWidth + gap);

        if (i < playersArray.length) {
            const p = playersArray[i];

            // วาดตัวการ์ดแบบผู้เล่นเข้าร่วมแล้ว
            ctx.fillStyle = 'rgba(15, 17, 21, 0.85)';
            drawCardOutline(ctx, cardX, cardY, cardWidth, cardHeight);
            ctx.fill();
            
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = themeColor;
            ctx.stroke();

            // อวาตาร์ผู้เล่น
            const avatarRadius = 26;
            const avatarX = cardX + (cardWidth / 2);
            const avatarY = cardY + 58;

            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2;
            ctx.stroke();

            if (p.avatarUrl) {
                try {
                    const avatar = await loadImage(p.avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(avatarX, avatarY, avatarRadius - 1.5, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(avatar, avatarX - avatarRadius + 1.5, avatarY - avatarRadius + 1.5, (avatarRadius - 1.5) * 2, (avatarRadius - 1.5) * 2);
                    ctx.restore();
                } catch (err) {
                    console.error('ไม่สามารถโหลดรูปโปรไฟล์การ์ดได้', err);
                }
            }

            // HOST Label
            if (i === 0) {
                ctx.fillStyle = themeColor;
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('HOST', cardX + (cardWidth / 2), cardY + 23);
            }

            // ไอคอนตำแหน่งที่มุมขวาล่างของวงกลม
            if (isValorant && p.role) {
                const roleColor = ROLE_COLORS[p.role] || '#FFFFFF';
                const roleImg = await getRoleIcon(p.role);
                
                const iconX = avatarX + 17;
                const iconY = avatarY + 17;
                
                ctx.beginPath();
                ctx.arc(iconX, iconY, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#0F1115';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = roleColor;
                ctx.stroke();

                if (roleImg) {
                    ctx.drawImage(roleImg, iconX - 7, iconY - 7, 14, 14);
                } else {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText(p.role[0], iconX, iconY + 3.5);
                }
            }

            // ชื่อผู้เล่น
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'center';
            let shortName = p.name ? (p.name.length > 12 ? p.name.substring(0,10)+'..' : p.name) : 'Player';
            ctx.fillText(shortName, cardX + (cardWidth / 2), cardY + 118);

        } else {
            // สล็อตว่าง (Dashed Empty Card)
            ctx.fillStyle = 'rgba(15, 17, 21, 0.4)';
            drawCardOutline(ctx, cardX, cardY, cardWidth, cardHeight);
            ctx.fill();
            
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // เครื่องหมายบวกตรงกลางการ์ดว่าง
            const centerX = cardX + (cardWidth / 2);
            const centerY = cardY + (cardHeight / 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(centerX - 8, centerY);
            ctx.lineTo(centerX + 8, centerY);
            ctx.moveTo(centerX, centerY - 8);
            ctx.lineTo(centerX, centerY + 8);
            ctx.stroke();
        }
    }

    // 8. ส่วนท้ายแบนเนอร์ (Footer Text)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const footerMsg = playersArray.length < maxPlayers ? '▪  WAITING FOR PLAYERS  ▪' : '▪  LOBBY FULL / MATCH STARTING  ▪';
    ctx.fillText(footerMsg, width / 2, 408);

    // 9. แสดงตัวสำรอง (Standbys)
    if (standbysArray && standbysArray.length > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('WAITLIST:', 40, 432);

        let stX = 120;
        const stY = 427;
        const stRadius = 13;
        
        for (let i = 0; i < standbysArray.length && i < 15; i++) {
            const sb = standbysArray[i];
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(stX, stY, stRadius, 0, Math.PI * 2, true);
            ctx.fillStyle = '#444';
            ctx.fill();
            
            try {
                if (sb.avatarUrl) {
                    const avatar = await loadImage(sb.avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(stX, stY, stRadius, 0, Math.PI * 2, true);
                    ctx.clip();
                    ctx.drawImage(avatar, stX - stRadius, stY - stRadius, stRadius * 2, stRadius * 2);
                    ctx.restore();
                }
            } catch (err) {}
            
            ctx.globalAlpha = 1.0;
            stX += (stRadius * 2) + 8;
        }
        
        if (standbysArray.length > 15) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`+${standbysArray.length - 15}`, stX + 5, stY + 4);
        }
    }

    return canvas.toBuffer();
}

module.exports = { generatePartyImage };
