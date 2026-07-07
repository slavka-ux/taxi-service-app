// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

// Валідація реєстрації
const registerValidation = [
    body('email')
        .isEmail()
        .withMessage('Введіть коректний email')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Пароль має містити мінімум 8 символів')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Пароль має містити велику та малу літери, та цифру'),
    body('firstName')
        .notEmpty()
        .withMessage('Ім\'я обов\'язкове')
        .isLength({ max: 50 })
        .withMessage('Ім\'я не може перевищувати 50 символів'),
    body('lastName')
        .notEmpty()
        .withMessage('Прізвище обов\'язкове')
        .isLength({ max: 50 }),
    body('phoneNumber')
        .optional()
        .matches(/^\+?[\d\s-]{8,15}$/)
        .withMessage('Введіть коректний номер телефону'),
    validateRequest
];

// Валідація логіну
const loginValidation = [
    body('email').isEmail().withMessage('Введіть коректний email').normalizeEmail(),
    body('password').notEmpty().withMessage('Пароль обов\'язковий'),
    validateRequest
];

// Маршрути
router.post(
    '/register',
    rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }), // 10 реєстрацій за годину
    registerValidation,
    authController.register
);

router.post(
    '/login',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
    loginValidation,
    authController.login
);

router.post(
    '/refresh',
    authController.refreshToken
);

router.post(
    '/logout',
    authenticate,
    authController.logout
);

router.post(
    '/forgot-password',
    rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
    body('email').isEmail().normalizeEmail(),
    validateRequest,
    authController.forgotPassword
);

router.post(
    '/reset-password',
    rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }),
    validateRequest,
    authController.resetPassword
);

router.get(
    '/verify-email/:token',
    authController.verifyEmail
);

module.exports = router;