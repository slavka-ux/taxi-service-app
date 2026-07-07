// backend/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const { cacheService } = require('../services/cacheService');

/**
 * Кастомний rate limiter з Redis
 */
const createRateLimiter = (options = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 хвилин
        max = 100,
        message = 'Забагато запитів, спробуйте пізніше',
        keyGenerator = (req) => req.ip,
        skip = null
    } = options;

    return async (req, res, next) => {
        // Перевірка чи пропускати
        if (skip && skip(req)) {
            return next();
        }

        const key = `rate_limit:${keyGenerator(req)}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        try {
            // Отримання даних з Redis
            const data = await cacheService.get(key);
            let requests = data ? JSON.parse(data) : [];

            // Фільтрація застарілих запитів
            requests = requests.filter(time => time > windowStart);

            // Перевірка ліміту
            if (requests.length >= max) {
                const resetTime = new Date(requests[0] + windowMs);
                return res.status(429).json({
                    success: false,
                    error: message,
                    retryAfter: Math.ceil((resetTime - now) / 1000)
                });
            }

            // Додавання нового запиту
            requests.push(now);
            await cacheService.set(key, JSON.stringify(requests), Math.ceil(windowMs / 1000));

            next();
        } catch (error) {
            // Якщо Redis недоступний, використовуємо in-memory
            next();
        }
    };
};

/**
 * Спеціальні rate limiters
 */
const rateLimiter = {
    // Стандартний ліміт для API
    default: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 100
    }),

    // Суворий ліміт для авторизації
    auth: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: 'Забагато спроб входу, спробуйте пізніше'
    }),

    // Ліміт для створення бронювань
    booking: createRateLimiter({
        windowMs: 60 * 60 * 1000,
        max: 30,
        message: 'Перевищено ліміт створення бронювань за годину'
    }),

    // Ліміт для пошуку
    search: createRateLimiter({
        windowMs: 60 * 1000,
        max: 60,
        message: 'Забагато пошукових запитів, спробуйте пізніше'
    })
};

/**
 * Простий rate limiter для специфічних випадків
 */
const simpleRateLimiter = (windowMs, max) => {
    const requests = new Map();

    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();

        if (!requests.has(key)) {
            requests.set(key, { count: 0, reset: now + windowMs });
        }

        const data = requests.get(key);

        if (now > data.reset) {
            data.count = 0;
            data.reset = now + windowMs;
        }

        data.count++;

        if (data.count > max) {
            return res.status(429).json({
                success: false,
                error: 'Перевищено ліміт запитів',
                retryAfter: Math.ceil((data.reset - now) / 1000)
            });
        }

        next();
    };
};

module.exports = {
    createRateLimiter,
    rateLimiter,
    simpleRateLimiter
};