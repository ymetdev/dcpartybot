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
    ctx.fillText(`🕒 ${time} น.`, width / 2, timeBoardY + 43);

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

    // 4. วาดช่องโปรไฟล์ (Avatar)
    const circleRadius = 45;
    const gap = 35;
    const totalWidth = (maxPlayers * (circleRadius * 2)) + ((maxPlayers - 1) * gap);
    let startX = (width - totalWidth) / 2 + circleRadius;
    const startY = 265;

    for (let i = 0; i < maxPlayers; i++) {
        // Drop shadow สำหรับรูปคน
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;

        // กรอบวงกลม
        ctx.beginPath();
        ctx.arc(startX, startY, circleRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        if (i < playersArray.length) {
            const p = playersArray[i];
            try {
                if (p.avatarUrl) {
                    const avatar = await loadImage(p.avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(startX, startY, circleRadius - 2, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(avatar, startX - circleRadius + 2, startY - circleRadius + 2, (circleRadius - 2) * 2, (circleRadius - 2) * 2);
                    ctx.restore();
                    
                    // เส้นขอบสีตามสถานะ
                    ctx.beginPath();
                    ctx.arc(startX, startY, circleRadius, 0, Math.PI * 2, true);
                    ctx.strokeStyle = themeColor;
                    ctx.stroke();
                }
            } catch (err) {
                console.error('ไม่สามารถโหลดรูปลง Canvas', err);
            }
            
            // ชื่อ Discord ใต้รูป
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'center';
            let shortName = p.name ? (p.name.length > 10 ? p.name.substring(0,8)+'..' : p.name) : 'Player';
            ctx.fillText(shortName, startX, startY + circleRadius + 20);

            // HOST Badge
            if (i === 0) {
                ctx.fillStyle = '#F39C12';
                ctx.fillRect(startX - 25, startY - circleRadius - 15, 50, 18);
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
                ctx.fillText('HOST', startX, startY - circleRadius - 2);
            }

            // Role Icon สำหรับ Valorant
            if (p.role && isValorant) {
                const roleColor = ROLE_COLORS[p.role] || '#FFFFFF';
                const roleImg = await getRoleIcon(p.role);
                
                // วาดวงกลมเล็กๆ มุมขวาล่าง
                const iconX = startX + 30;
                const iconY = startY + 30;
                ctx.beginPath();
                ctx.arc(iconX, iconY, 15, 0, Math.PI * 2);
                ctx.fillStyle = '#0F1115';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = roleColor;
                ctx.stroke();

                if (roleImg) {
                    // วาดไอคอนบทบาทลงในวงกลม
                    const imgSize = 20;
                    ctx.drawImage(roleImg, iconX - (imgSize / 2), iconY - (imgSize / 2), imgSize, imgSize);
                } else {
                    // Fallback เป็นตัวหนังสือตัวแรกถ้าโหลดรูปไม่ขึ้น
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.fillText(p.role[0], iconX, iconY + 5);
                }
            }

        } else {
            // สล็อตว่าง
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = 'bold 36px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('+', startX, startY + 12);
        }

        startX += (circleRadius * 2) + gap;
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
