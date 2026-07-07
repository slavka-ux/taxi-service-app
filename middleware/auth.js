// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { cacheService } = require('../services/cacheService');
const { AppError } = require('../utils/errors');

/**
 * Перевірка JWT токену
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Необхідна авторизація', 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Перевірка чи токен не в чорному списку
        const isBlacklisted = await cacheService.get(`blacklist:${token}`);
        if (isBlacklisted) {
            throw new AppError('Токен недійсний', 401);
        }

        // Отримання даних користувача з кешу або БД
        const cacheKey = `user:${decoded.userId}`;
        let user = await cacheService.get(cacheKey);

        if (!user) {
            user = await User.findById(decoded.userId);
            if (!user) {
                throw new AppError('Користувач не знайдений', 401);
            }
            await cacheService.set(cacheKey, user, 300);
        }

        req.user = user;
        req.user.id = decoded.userId;
        req.user.role = user.role || 'user';

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            next(new AppError('Невалідний токен', 401));
        } else if (error.name === 'TokenExpiredError') {
            next(new AppError('Токен прострочено', 401));
        } else {
            next(error);
        }
    }
};

/**
 * Опціональна авторизація (не блокує запит)
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (user) {
                req.user = user;
                req.user.id = decoded.userId;
            }
        }
    } catch (error) {
        // Ігноруємо помилки при опціональній авторизації
    }
    next();
};

/**
 * Перевірка ролі (для адмінських маршрутів)
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new AppError('Необхідна авторизація', 401);
        }

        if (!roles.includes(req.user.role)) {
            throw new AppError('Недостатньо прав доступу', 403);
        }

        next();
    };
};

module.exports = {
    authenticate,
    optionalAuth,
    authorize
};