import mongoose from 'mongoose';
export default async function connectDB(uri = process.env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}
