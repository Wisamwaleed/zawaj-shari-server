import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);
