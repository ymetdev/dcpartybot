const https = require('https');

https.get('https://valorant-api.com/v1/competitivetiers', (resp) => {
  let data = '';
  resp.on('data', (chunk) => {
    data += chunk;
  });
  resp.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Competitive Tiers Count:', json.data.length);
      const tier0 = json.data[json.data.length - 1].tiers[0];
      console.log('Tier 0 Name:', tier0.tierName);
      console.log('Tier 0 Icon:', tier0.largeIcon);
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
