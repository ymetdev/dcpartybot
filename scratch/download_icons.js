const fs = require('fs');
const path = require('path');
const https = require('https');

const icons = {
    'Duelist': 'https://media.valorant-api.com/agents/roles/dbe8757e-9e92-4ed4-b39f-9dfc589691d4/displayicon.png',
    'Initiator': 'https://media.valorant-api.com/agents/roles/1b47567f-8f7b-444b-aae3-b0c634622d10/displayicon.png',
    'Controller': 'https://media.valorant-api.com/agents/roles/4ee40330-ecdd-4f2f-98a8-eb1243428373/displayicon.png',
    'Sentinel': 'https://media.valorant-api.com/agents/roles/5fc02f99-4091-4486-a531-98459a3e95e9/displayicon.png',
    'Flex': 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/largeicon.png'
};

const dir = path.join(__dirname, '../assets/icons');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

function download(url, filename) {
    const file = fs.createWriteStream(path.join(dir, filename));
    https.get(url, function(response) {
        if (response.statusCode !== 200) {
            console.error(`Failed to download ${filename}: status code ${response.statusCode}`);
            return;
        }
        response.pipe(file);
        file.on('finish', function() {
            file.close();
            console.log(`Downloaded ${filename} successfully.`);
        });
    }).on('error', function(err) {
        fs.unlink(path.join(dir, filename), () => {});
        console.error(`Error downloading ${filename}:`, err.message);
    });
}

for (const [name, url] of Object.entries(icons)) {
    download(url, `${name.toLowerCase()}.png`);
}
