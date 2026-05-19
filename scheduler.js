const schedule = require('node-schedule');

// Store active jobs by message ID
const jobs = new Map(); 

// แปลงเวลา HH:MM เป็น Date object
function getExactTime(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);

    const now = new Date();
    let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    // ถ้าเวลาผ่านไปแล้ว ถือว่าเป็นวันพรุ่งนี้
    if (targetTime < now) {
        targetTime.setDate(targetTime.getDate() + 1);
    }

    return targetTime;
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

    const reminderTime = new Date(exactTime.getTime());
    reminderTime.setMinutes(reminderTime.getMinutes() - 15);
    
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
                await message.channel.send(`⏰ ${mentions.join(' ')}\nปาร์ตี้ **${embed.title}** ${alertMsg}`);
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
        console.log(`ตั้งปลุกสำหรับ ${messageId} เวลา ${exactTime.toLocaleTimeString()}`);
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
