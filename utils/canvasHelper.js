const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// ฝังฟอนต์ภาษาไทยเพื่อแก้ปัญหากรอบสี่เหลี่ยมบน Linux (Render)
try {
    registerFont(path.join(__dirname, '../assets/fonts/NotoSansThai-Regular.ttf'), { family: 'Noto Sans Thai' });
    registerFont(path.join(__dirname, '../assets/fonts/NotoSansThai-Bold.ttf'), { family: 'Noto Sans Thai', weight: 'bold' });
} catch (e) {
    console.error('ไม่สามารถโหลดฟอนต์ภาษาไทยได้', e);
}

async function generatePartyImage(game, time, maxPlayers, playersArray, standbysArray) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. พื้นหลัง Dark Mode Minimalist
    ctx.fillStyle = '#1A1A1D';
    ctx.fillRect(0, 0, width, height);

    // เส้นขอบสีฟ้าเขียวพรีเมียม
    ctx.fillStyle = '#4ECCA3';
    ctx.fillRect(0, 0, width, 8);

    // 2. ตัวหนังสือ
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'center';
    // เอา Emoji 🎮 ออกเพราะบน Linux อาจจะกลายเป็นสี่เหลี่ยม
    ctx.fillText(`${game}`, width / 2, 70);

    ctx.fillStyle = '#A0A0A0';
    ctx.font = '24px "Noto Sans Thai", sans-serif';
    ctx.fillText(`เวลา: ${time} | จำนวน: ${playersArray.length}/${maxPlayers}`, width / 2, 110);

    // 3. วาดช่องโปรไฟล์ (Avatar)
    const circleRadius = 45;
    const gap = 30;
    const totalWidth = (maxPlayers * (circleRadius * 2)) + ((maxPlayers - 1) * gap);
    let startX = (width - totalWidth) / 2 + circleRadius;
    const startY = 220;

    for (let i = 0; i < maxPlayers; i++) {
        // กรอบวงกลมว่าง
        ctx.beginPath();
        ctx.arc(startX, startY, circleRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#333333';
        ctx.stroke();

        if (i < playersArray.length) {
            const p = playersArray[i];
            try {
                if (p.avatarUrl) {
                    const avatar = await loadImage(p.avatarUrl);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(startX, startY, circleRadius - 3, 0, Math.PI * 2, true);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(avatar, startX - circleRadius + 3, startY - circleRadius + 3, (circleRadius - 3) * 2, (circleRadius - 3) * 2);
                    ctx.restore();
                    
                    // เส้นขอบเรืองแสงสำหรับคนเข้าร่วม
                    ctx.beginPath();
                    ctx.arc(startX, startY, circleRadius, 0, Math.PI * 2, true);
                    ctx.strokeStyle = '#4ECCA3';
                    ctx.stroke();
                }
            } catch (err) {
                console.error('ไม่สามารถโหลดรูปลง Canvas', err);
            }
            
            // แทนที่จะใช้มงกุฎ (Crown Emoji) ใช้คำว่า HOST แทน
            if (i === 0) {
                ctx.fillStyle = '#F39C12';
                ctx.font = 'bold 16px "Noto Sans Thai", sans-serif';
                ctx.fillText('HOST', startX, startY - circleRadius - 10);
            }
        } else {
            // สล็อตว่าง
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 30px "Noto Sans Thai", sans-serif';
            ctx.fillText('+', startX, startY + 10);
        }

        startX += (circleRadius * 2) + gap;
    }
    
    // 4. แสดงตัวสำรอง
    if (standbysArray && standbysArray.length > 0) {
        ctx.fillStyle = '#A0A0A0';
        ctx.font = '18px "Noto Sans Thai", sans-serif';
        ctx.fillText(`+ คิวตัวสำรอง: ${standbysArray.length} คน`, width / 2, 350);
    }

    return canvas.toBuffer();
}

module.exports = { generatePartyImage };
