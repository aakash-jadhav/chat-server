import mongoose from 'mongoose';
import { resolveMongoUri } from './resolveMongoUri.js';

export async function connectDB(uri) {
  const options = { serverSelectionTimeoutMS: 15000 };

  if (process.env.MONGODB_URI_STANDARD) {
    await mongoose.connect(process.env.MONGODB_URI_STANDARD, options);
    console.log('MongoDB connected (standard URI)');
    return;
  }

  try {
    await mongoose.connect(uri, options);
    console.log('MongoDB connected');
    return;
  } catch (directErr) {
    if (!uri?.startsWith('mongodb+srv://')) {
      throw directErr;
    }
    console.warn(
      'Direct connection failed, retrying via manual SRV resolution:',
      directErr.message
    );
  }

  const connectionUri = await resolveMongoUri(uri);
  await mongoose.connect(connectionUri, options);
  console.log('MongoDB connected (SRV fallback via public DNS)');
}
