import 'dotenv/config';
import dns from 'node:dns';
import createApp from './app.js';
import connectDB from './config/db.js';

const mongoDnsServers = (process.env.MONGODB_DNS_SERVERS || '')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);
if (mongoDnsServers.length) dns.setServers(mongoDnsServers);

for (const k of ['MONGODB_URI', 'JWT_SECRET']) if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }
await connectDB();
const port = process.env.PORT || 5000;
createApp().listen(port, () => console.log(`HCM Lite API listening on :${port}`));
