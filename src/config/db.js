import mongoose from 'mongoose';
import { resolveMongoUri } from './resolveMongoUri.js';

export async function connectDB(uri) {
  const connectionUri = await resolveMongoUri(uri);

  if (connectionUri !== uri) {
    console.log('Resolved mongodb+srv URI via public DNS (SRV → standard connection)');
  }

  await mongoose.connect(connectionUri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('MongoDB connected');
}
