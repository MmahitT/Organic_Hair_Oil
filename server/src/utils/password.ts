import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// bcryptjs is the pure-JS bcrypt implementation (same algorithm/format as `bcrypt`, no native build step).
export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used to keep login timing similar when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);
export const verifyAgainstDummy = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);
