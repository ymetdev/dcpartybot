const schedule = require('node-schedule');
const moment = require('moment-timezone');

// Store active jobs by message ID
const jobs = new Map(); 

// แปลงเวลา HH:MM ให้เป็น Date object อ้างอิงตามเวลาไทย (UTC+7)
function getExactTime(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    // สร้างเวลาใน Timezone ประเทศไทย (Asia/Bangkok)
    const exactTime = moment.tz(timeStr, 'HH:mm', 'Asia/Bangkok');
    
    // ถ้าเวลาที่ใส่มามันน้อยกว่าเวลาปัจจุบัน (แปลว่าเวลาผ่านไปแล้วของวันนี้) ให้ปัดไปเป็นวันพรุ่งนี้
    if (exactTime.isBefore(moment.tz('Asia/Bangkok'))) {
        exactTime.add(1, 'day');
    }

    return exactTime.toDate(); // คืนค่าเป็น Native Date object (Epoch) ซึ่งข้ามกำแพง Timezone ไปเลย
}

function scheduleJob(message, timeStr) {
    const messageId = message.id;
    
    // เคลียร์อันเก่าถ้ามี
    cancelJob(messageId);

    const exactTime = getExactTime(timeStr);
    if (!exactTime) {
        console.log(`รูปแบบเวลาไม่ถูกต้อง: ${timeStr}`);
        return false;
    }

    // เวลาเตือนล่วงหน้า 15 นาที
    const reminderTime = new Date(exactTime.getTime() - (15 * 60 * 1000));
    const now = new Date();
    const jobList = [];

    // ฟังก์ชันช่วยดึงคนที่จะแท็ก
    async function executeAlert(alertMsg, isFinal) {
        try {
            const fetchedMsg = await message.channel.messages.fetch(messageId);
            if (!fetchedMsg || !fetchedMsg.embeds[0]) return;
            if (fetchedMsg.embeds[0].title.includes('❌')) return;

            const embed = fetchedMsg.embeds[0];
            const mentions = [];
            const regex = /<@\d+>/g;
            let match;
            while ((match = regex.exec(embed.description)) !== null) {
                if (!mentions.includes(match[0])) {
                    mentions.push(match[0]);
                }
            }

            if (mentions.length > 0) {
                await message.channel.send(`⏰ ${mentions.join(' ')}\nปาร์ตี้ **${embed.title.replace('🎮 ', '')}** ${alertMsg}`);
            }
        } catch (error) {
            console.error("Error running job", error);
        }
        
        if (isFinal) {
            jobs.delete(messageId);
        }
    }

    // 1. ตั้งปลุกเตือนล่วงหน้า 15 นาที (ถ้ายังไม่ถึงเวลานั้น)
    if (reminderTime > now) {
        const j1 = schedule.scheduleJob(reminderTime, () => executeAlert('จะเริ่มในอีก 15 นาทีครับ!', false));
        if (j1) jobList.push(j1);
    }

    // 2. ตั้งปลุกตอนถึงเวลาเป๊ะๆ
    if (exactTime > now) {
        const j2 = schedule.scheduleJob(exactTime, () => executeAlert('ถึงเวลาเริ่มเกมแล้ว ลุยเลย! 🚀', true));
        if (j2) jobList.push(j2);
    }

    if (jobList.length > 0) {
        jobs.set(messageId, jobList);
        console.log(`ตั้งปลุกสำหรับ ${messageId} เวลา ${exactTime.toLocaleString()}`);
        return true;
    }
    return false;
}

function cancelJob(messageId) {
    const jobList = jobs.get(messageId);
    if (jobList) {
        jobList.forEach(job => job.cancel());
        jobs.delete(messageId);
        console.log(`ยกเลิกปลุกสำหรับ ${messageId}`);
    }
}

module.exports = { scheduleJob, cancelJob, getExactTime };
