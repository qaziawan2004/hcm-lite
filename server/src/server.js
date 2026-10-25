import 'dotenv/config';
import createApp from './app.js';
import connectDB from './config/db.js';

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing env var ${key}`);
    process.exit(1);
  }
}

try {
  await connectDB();
} catch (error) {
  if (error.syscall === 'querySrv' || error.code === 'ECONNREFUSED') {
    console.error(
      `MongoDB connection failed (${error.code || 'DNS error'}). Check Atlas connectivity and, if using an SRV URI, configure a working MONGODB_DNS_SERVERS resolver in server/.env.`
    );
  } else {
    console.error('MongoDB connection failed:', error.message);
  }
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, () => console.log(`HCM Lite API listening on :${port}`));
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other API process or set a different PORT in server/.env.`);
  } else {
    console.error('The API server failed to start:', error.message);
  }
  process.exitCode = 1;
});
