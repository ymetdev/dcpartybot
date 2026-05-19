const fs = require('fs');
const path = require('path');
const https = require('https');

const icons = {
    'Duelist': 'https://media.valorant-api.com/agents/roles/d76e2355-327e-8157-9d92-27ee987c9d99/displayicon.png',
    'Initiator': 'https://media.valorant-api.com/agents/roles/1b47defb-4524-8d94-0130-ab834b6b6c7b/displayicon.png',
    'Controller': 'https://media.valorant-api.com/agents/roles/4ee40330-4759-ae18-7757-b6ae6f1a1a72/displayicon.png',
    'Sentinel': 'https://media.valorant-api.com/agents/roles/5cdbf758-3434-111e-221d-c9a414b31804/displayicon.png',
    'Flex': 'https://media.valorant-api.com/competitivetiers/03b096f2-499b-9c68-54f2-6989f52f3908/0/displayicon.png'
};

const dir = path.join(__dirname, '../assets/icons');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

function download(url, filename) {
    const file = fs.createWriteStream(path.join(dir, filename));
    https.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close();
            console.log(`Downloaded ${filename} successfully.`);
        });
    }).on('error', function(err) {
        fs.unlink(path.join(dir, filename));
        console.error(`Error downloading ${filename}:`, err.message);
    });
}

for (const [name, url] of Object.entries(icons)) {
    download(url, `${name.toLowerCase()}.png`);
}
