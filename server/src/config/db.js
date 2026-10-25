import mongoose from 'mongoose';
import { setServers } from 'node:dns';
import { isIP } from 'node:net';

let connectionPromise;

function configureDns() {
  const servers = (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (!servers.length) return;
  if (servers.some((server) => !isIP(server))) {
    throw new Error('MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses.');
  }

  setServers(servers);
}

export default async function connectDB(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (mongoose.connection.readyState !== 2) {
    connectionPromise = null;
  }

  if (connectionPromise) return connectionPromise;

  configureDns();
  mongoose.set('strictQuery', true);
  connectionPromise = mongoose.connect(uri)
    .then((connection) => {
      console.log('MongoDB connected');
      return connection;
    })
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
}
