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

    // 1. วาดรูปพื้นหลัง (Dynamic Background)
    ctx.fillStyle = '#0F1115';
    ctx.fillRect(0, 0, width, height);
    try {
        let bgBuffer = isValorant ? bgValorant : bgDefault;
        if (bgBuffer) {
            const bgImage = await loadImage(bgBuffer);
            ctx.drawImage(bgImage, 0, 0, width, height);
            // สร้าง Filter มืดๆ ทับไม่ให้รูปกวนตัวหนังสือ
            ctx.fillStyle = 'rgba(15, 17, 21, 0.7)';
            ctx.fillRect(0, 0, width, height);
        }
    } catch (e) {}

    // เส้นขอบสีธีมพรีเมียม
    const themeColor = isValorant ? '#FF4655' : '#4ECCA3';
    ctx.fillStyle = themeColor;
    ctx.fillRect(0, 0, width, 8);

    // 2. ตัวหนังสือ
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 44px "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${game}`, width / 2, 70);
    ctx.shadowBlur = 0; // Reset shadow

    // 2.2 วาดแผงเวลาดิจิตอล (Digital Time Board)
    const timeBoardWidth = 260;
    const timeBoardHeight = 52;
    const timeBoardX = (width - timeBoardWidth) / 2;
    const timeBoardY = 92;

    // พื้นหลังแผงเวลาสีเข้ม
    ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
    ctx.beginPath();
    ctx.roundRect(timeBoardX, timeBoardY, timeBoardWidth, timeBoardHeight, 8);
    ctx.fill();
    
    // เส้นขอบนีออนของแผงเวลา
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeColor;
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // ตัวหนังสือ "START TIME" ตัวเล็กด้านบนแผง
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('MATCH START TIME', width / 2, timeBoardY + 18);

    // ตัวเลขเวลาขนาดใหญ่เน้นๆ
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'left';
    
    const timeText = `${time} น.`;
    const timeTextWidth = ctx.measureText(timeText).width;
    
    // จัดตำแหน่งให้ไอคอนนาฬิกาและตัวหนังสืออยู่กึ่งกลางร่วมกัน
    const clockRadius = 9;
    const gapBetween = 10;
    const totalContentWidth = (clockRadius * 2) + gapBetween + timeTextWidth;
    const startXPos = timeBoardX + (timeBoardWidth - totalContentWidth) / 2;
    
    // วาดไอคอนนาฬิกาเวกเตอร์ (Vector Clock Icon)
    const clockX = startXPos + clockRadius;
    const clockY = timeBoardY + 34;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(clockX, clockY, clockRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // เข็มชั่วโมงและนาที
    ctx.beginPath();
    ctx.moveTo(clockX, clockY);
    ctx.lineTo(clockX, clockY - 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clockX, clockY);
    ctx.lineTo(clockX + 4, clockY);
    ctx.stroke();

    // วาดข้อความเวลา
    ctx.fillText(timeText, startXPos + (clockRadius * 2) + gapBetween, timeBoardY + 43);
    ctx.textAlign = 'center'; // reset alignment

    // 3. Neon Progress Bar
    const barWidth = 400;
    const barHeight = 8;
    const barX = (width - barWidth) / 2;
    const barY = 162;
    const progressRatio = playersArray.length / maxPlayers;

    // กรอบเปล่า
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    // หลอดพลัง
    if (progressRatio > 0) {
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * progressRatio, barHeight, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "Noto Sans Thai", sans-serif';
    ctx.fillText(`${playersArray.length} / ${maxPlayers} PLAYERS`, width / 2, 192);

    // 4. วาด Lobby Player Cards
    const cardWidth = 120;
    const cardHeight = 180;
    const gap = 18;
    const totalWidth = (maxPlayers * cardWidth) + ((maxPlayers - 1) * gap);
    let startX = (width - totalWidth) / 2;
    const cardY = 210;

    for (let i = 0; i < maxPlayers; i++) {
        const cardX = startX + i * (cardWidth + gap);

        if (i < playersArray.length) {
            const p = playersArray[i];

            // วาดการ์ดแบบผู้เล่นเข้าร่วมแล้ว
            ctx.fillStyle = isValorant ? 'rgba(255, 70, 85, 0.06)' : 'rgba(78, 204, 163, 0.06)';
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 10);
            ctx.fill();
            
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = isValorant ? 'rgba(255, 70, 85, 0.25)' : 'rgba(78, 204, 163, 0.25)';
            ctx.stroke();

            // รัศมีอวาตาร์
            const avatarRadius = 28;
            const avatarX = cardX + (cardWidth / 2);
            const avatarY = cardY + 46;

            // วาดขอบอวาตาร์
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2.5;
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
                    console.error('ไม่สามารถโหลดรูปลงการ์ดได้', err);
                }
            }

            // HOST Badge
            if (i === 0) {
                ctx.fillStyle = '#F39C12';
                ctx.beginPath();
                ctx.roundRect(cardX + (cardWidth - 54) / 2, cardY - 8, 54, 16, 4);
                ctx.fill();
                
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 10px "Noto Sans Thai", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('HOST', cardX + (cardWidth / 2), cardY + 4);
            }

            // Role Icon สำหรับ Valorant
            if (isValorant) {
                if (p.role) {
                    const roleColor = ROLE_COLORS[p.role] || '#FFFFFF';
                    const roleImg = await getRoleIcon(p.role);
                    
                    const roleBadgeWidth = 84;
                    const roleBadgeHeight = 24;
                    const roleBadgeX = cardX + (cardWidth - roleBadgeWidth) / 2;
                    const roleBadgeY = cardY + 86;

                    ctx.fillStyle = 'rgba(15, 17, 21, 0.9)';
                    ctx.beginPath();
                    ctx.roundRect(roleBadgeX, roleBadgeY, roleBadgeWidth, roleBadgeHeight, 6);
                    ctx.fill();
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = roleColor;
                    ctx.stroke();

                    if (roleImg) {
                        ctx.drawImage(roleImg, roleBadgeX + 6, roleBadgeY + 4, 16, 16);
                    }
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(p.role, roleBadgeX + 26, roleBadgeY + 16);
                } else {
                    // ไม่มีตำแหน่ง (สำหรับผู้เล่นที่ยังไม่เลือก)
                    const roleBadgeWidth = 84;
                    const roleBadgeHeight = 24;
                    const roleBadgeX = cardX + (cardWidth - roleBadgeWidth) / 2;
                    const roleBadgeY = cardY + 86;

                    ctx.fillStyle = 'rgba(15, 17, 21, 0.5)';
                    ctx.beginPath();
                    ctx.roundRect(roleBadgeX, roleBadgeY, roleBadgeWidth, roleBadgeHeight, 6);
                    ctx.fill();
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = '10px "Noto Sans Thai", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('NO ROLE', cardX + (cardWidth / 2), roleBadgeY + 15);
                }
            }

            // ชื่อ Discord
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'center';
            let shortName = p.name ? (p.name.length > 12 ? p.name.substring(0,10)+'..' : p.name) : 'Player';
            ctx.fillText(shortName, cardX + (cardWidth / 2), cardY + (isValorant ? 134 : 110));

            // สถานะ READY
            ctx.fillStyle = '#4ECCA3';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('READY', cardX + (cardWidth / 2), cardY + (isValorant ? 158 : 140));

        } else {
            // สล็อตว่าง (Dashed Empty Card)
            ctx.fillStyle = 'rgba(15, 17, 21, 0.4)';
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 10);
            ctx.fill();
            
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // วาดเครื่องหมาย + ตรงกลางสล็อตว่าง
            const centerX = cardX + (cardWidth / 2);
            const centerY = cardY + 65;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX - 8, centerY);
            ctx.lineTo(centerX + 8, centerY);
            ctx.moveTo(centerX, centerY - 8);
            ctx.lineTo(centerX, centerY + 8);
            ctx.stroke();

            // ข้อความบอกสถานะสล็อตว่าง
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('OPEN SLOT', cardX + (cardWidth / 2), cardY + 145);
        }
    }
    
    // 5. แสดงตัวสำรอง (Standbys)
    if (standbysArray && standbysArray.length > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 14px "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('WAITLIST:', 40, 410);

        let stX = 130;
        const stY = 405;
        const stRadius = 15;
        
        for (let i = 0; i < standbysArray.length && i < 10; i++) {
            const sb = standbysArray[i];
            ctx.globalAlpha = 0.5; // โปร่งแสง
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
            stX += (stRadius * 2) + 10;
        }
        
        if (standbysArray.length > 10) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
            ctx.fillText(`+${standbysArray.length - 10}`, stX + 5, stY + 5);
        }
    }

    return canvas.toBuffer();
}

module.exports = { generatePartyImage };
