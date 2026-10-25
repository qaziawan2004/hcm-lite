import 'dotenv/config';
import createApp from '../src/app.js';
import connectDB from '../src/config/db.js';

const app = createApp();

export default async function handler(req, res) {
  for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[key]) {
      console.error(`Missing env var ${key}`);
      return res.status(500).json({ message: 'Server configuration is incomplete.' });
    }
  }

  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error);
    return res.status(500).json({ message: 'The API could not connect to its database.' });
  }
}
