import 'dotenv/config';
import createApp from './app.js';
import connectDB from './config/db.js';

for (const k of ['MONGODB_URI', 'JWT_SECRET']) if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }
await connectDB();
const port = process.env.PORT || 5000;
createApp().listen(port, () => console.log(`HCM Lite API listening on :${port}`));
