// backend/routes/users.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { validateRequest } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

// Валідація оновлення профілю
const updateProfileValidation = [
    body('firstName')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Ім\'я не може перевищувати 50 символів'),
    body('lastName')
        .optional()
        .isLength({ max: 50 }),
    body('phoneNumber')
        .optional()
        .matches(/^\+?[\d\s-]{8,15}$/)
        .withMessage('Введіть коректний номер телефону'),
    body('language')
        .optional()
        .isIn(['uk', 'en', 'ru'])
        .withMessage('Невірна мова'),
    body('currency')
        .optional()
        .isIn(['USD', 'EUR', 'UAH'])
        .withMessage('Невірна валюта'),
    validateRequest
];

// Маршрути
router.get('/me', authenticate, userController.getProfile);

router.patch(
    '/me',
    authenticate,
    updateProfileValidation,
    userController.updateProfile
);

router.post(
    '/me/change-password',
    authenticate,
    body('currentPassword').notEmpty().withMessage('Поточний пароль обов\'язковий'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Новий пароль має містити мінімум 8 символів')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Новий пароль має містити велику та малу літери, та цифру'),
    validateRequest,
    userController.changePassword
);

router.get('/me/bookings', authenticate, userController.getBookingHistory);

router.get('/me/bonuses', authenticate, userController.getBonuses);

router.delete('/me', authenticate, userController.deactivateAccount);

// Адмінські маршрути (потрібна роль admin)
router.get(
    '/',
    authenticate,
    userController.getAllUsers // TODO: Додати перевірку ролі
);

module.exports = router;