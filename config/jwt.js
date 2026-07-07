// backend/config/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET || JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

/**
 * Генерація токенів
 */
const generateTokens = (userId, email, role = 'user') => {
    const payload = { userId, email, role };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY
    });

    const refreshToken = jwt.sign({ userId, email }, REFRESH_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY
    });

    return { accessToken, refreshToken };
};

/**
 * Верифікація access токену
 */
const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

/**
 * Верифікація refresh токену
 */
const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, REFRESH_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = {
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
    JWT_SECRET,
    REFRESH_SECRET,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY
};