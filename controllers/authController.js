// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { cacheService } = require('../services/cacheService');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * @desc    Реєстрація нового користувача
 * @route   POST /api/v1/auth/register
 */
exports.register = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName, phoneNumber } = req.body;

        // Перевірка чи email вже існує
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            throw new AppError('Користувач з таким email вже існує', 409);
        }

        // Хешування пароля
        const hashedPassword = await bcrypt.hash(password, 12);

        // Створення користувача
        const user = await User.create({
            email,
            password_hash: hashedPassword,
            first_name: firstName,
            last_name: lastName,
            phone_number: phoneNumber,
            is_active: true,
            email_verified: false,
            bonus_points: 0,
            currency: 'USD',
            language: 'uk'
        });

        // Генерація токенів
        const { accessToken, refreshToken } = generateTokens(user.id, user.email);

        // Збереження refresh token в Redis
        await cacheService.set(
            `refresh:${user.id}`,
            refreshToken,
            7 * 24 * 60 * 60 // 7 днів
        );

        // Відправка email для верифікації
        const verificationToken = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        await sendVerificationEmail(email, firstName, verificationToken);

        // Логування
        logger.info(`Новий користувач зареєструвався: ${email}`);

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    bonusPoints: user.bonus_points
                },
                accessToken,
                refreshToken,
                requiresEmailVerification: true
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Вхід користувача
 * @route   POST /api/v1/auth/login
 */
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Пошук користувача
        const user = await User.findByEmail(email);
        if (!user) {
            throw new AppError('Невірний email або пароль', 401);
        }

        // Перевірка чи активний
        if (!user.is_active) {
            throw new AppError('Акаунт деактивовано, зверніться до підтримки', 403);
        }

        // Перевірка пароля
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new AppError('Невірний email або пароль', 401);
        }

        // Оновлення часу останнього входу
        await User.updateLastLogin(user.id);

        // Генерація токенів
        const { accessToken, refreshToken } = generateTokens(user.id, user.email);

        // Збереження refresh token
        await cacheService.set(
            `refresh:${user.id}`,
            refreshToken,
            7 * 24 * 60 * 60
        );

        // Очищення чутливих даних
        delete user.password_hash;

        logger.info(`Користувач увійшов: ${email}`);

        res.json({
            success: true,
            data: {
                user,
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Оновлення токену доступу
 * @route   POST /api/v1/auth/refresh
 */
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            throw new AppError('Refresh token обов\'язковий', 400);
        }

        // Перевірка токену
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            throw new AppError('Невалідний refresh token', 401);
        }

        // Перевірка в Redis
        const storedToken = await cacheService.get(`refresh:${decoded.userId}`);
        if (storedToken !== refreshToken) {
            throw new AppError('Refresh token не знайдено', 401);
        }

        // Генерація нового access token
        const newAccessToken = jwt.sign(
            { userId: decoded.userId, email: decoded.email },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.json({
            success: true,
            data: {
                accessToken: newAccessToken
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Вихід з системи
 * @route   POST /api/v1/auth/logout
 */
exports.logout = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Видалення refresh token з Redis
        await cacheService.del(`refresh:${userId}`);
        await cacheService.del(`user:${userId}`); // Очищення кешу користувача

        logger.info(`Користувач вийшов: ${userId}`);

        res.json({
            success: true,
            message: 'Вихід виконано успішно'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Запит на відновлення пароля
 * @route   POST /api/v1/auth/forgot-password
 */
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        const user = await User.findByEmail(email);
        if (!user) {
            // Не розкриваємо інформацію про існування email
            return res.json({
                success: true,
                message: 'Якщо користувач з таким email існує, лист було надіслано'
            });
        }

        // Генерація токену для скидання
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = await bcrypt.hash(resetToken, 10);

        // Збереження токену (на 1 годину)
        await User.setResetToken(user.id, hashedToken);

        // Відправка email
        await sendPasswordResetEmail(email, user.first_name, resetToken);

        logger.info(`Відновлення пароля для: ${email}`);

        res.json({
            success: true,
            message: 'Якщо користувач з таким email існує, лист було надіслано'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Скидання пароля
 * @route   POST /api/v1/auth/reset-password
 */
exports.resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        // Пошук користувача по токену
        const user = await User.findByResetToken(token);
        if (!user) {
            throw new AppError('Невалідний або прострочений токен', 400);
        }

        // Оновлення пароля
        const hashedPassword = await bcrypt.hash(password, 12);
        await User.updatePassword(user.id, hashedPassword);

        // Видалення токену скидання
        await User.clearResetToken(user.id);

        // Видалення всіх сесій користувача
        await cacheService.del(`refresh:${user.id}`);

        logger.info(`Пароль змінено для: ${user.email}`);

        res.json({
            success: true,
            message: 'Пароль успішно змінено'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Верифікація email
 * @route   GET /api/v1/auth/verify-email/:token
 */
exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.params;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded) {
            throw new AppError('Невалідний токен верифікації', 400);
        }

        await User.verifyEmail(decoded.userId);

        logger.info(`Email верифіковано: ${decoded.userId}`);

        // Редирект на фронтенд
        res.redirect(`${process.env.FRONTEND_URL}/email-verified`);
    } catch (error) {
        next(error);
    }
};