import mongoose from 'mongoose';

let connectionPromise;

export default async function connectDB(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (mongoose.connection.readyState !== 2) {
    connectionPromise = null;
  }

  if (connectionPromise) return connectionPromise;

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
