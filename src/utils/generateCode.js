import Session from '../models/Session.js';

export async function generateUniqueSixDigitCode() {
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await Session.exists({ sixDigitCode: code });
    if (!exists) {
      return code;
    }
  }

  throw new Error('Unable to generate a unique 6-digit code');
}
