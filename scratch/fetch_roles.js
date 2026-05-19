const https = require('https');

https.get('https://valorant-api.com/v1/agents', (resp) => {
  let data = '';
  resp.on('data', (chunk) => {
    data += chunk;
  });
  resp.on('end', () => {
    try {
      const json = JSON.parse(data);
      const roles = {};
      json.data.forEach(agent => {
        if (agent.role && !roles[agent.role.displayName]) {
          roles[agent.role.displayName] = {
            uuid: agent.role.uuid,
            displayIcon: agent.role.displayIcon
          };
        }
      });
      console.log('Roles found:', Object.keys(roles));
      console.log('Roles JSON:', JSON.stringify(roles, null, 2));
    } catch (e) {
      console.error('Error parsing JSON:', e.message);
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
