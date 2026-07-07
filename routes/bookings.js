// backend/routes/bookings.js
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { validateRequest } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

// Валідація створення бронювання
const createBookingValidation = [
    body('flightId')
        .isUUID()
        .withMessage('Некоректний ID рейсу'),
    body('returnFlightId')
        .optional()
        .isUUID()
        .withMessage('Некоректний ID зворотнього рейсу'),
    body('passengers')
        .isArray({ min: 1, max: 9 })
        .withMessage('Мінімум 1 пасажир, максимум 9'),
    body('passengers.*.firstName')
        .notEmpty()
        .withMessage('Ім\'я пасажира обов\'язкове'),
    body('passengers.*.lastName')
        .notEmpty()
        .withMessage('Прізвище пасажира обов\'язкове'),
    body('passengers.*.dateOfBirth')
        .isISO8601()
        .withMessage('Введіть коректну дату народження'),
    body('passengers.*.documentType')
        .isIn(['passport', 'id_card'])
        .withMessage('Тип документа має бути passport або id_card'),
    body('passengers.*.documentNumber')
        .notEmpty()
        .withMessage('Номер документа обов\'язковий'),
    body('passengers.*.passengerType')
        .isIn(['adult', 'child', 'infant'])
        .withMessage('Невірний тип пасажира'),
    body('discountCode')
        .optional()
        .isString()
        .withMessage('Некоректний код знижки'),
    body('specialRequests')
        .optional()
        .isArray()
        .withMessage('Спеціальні запити мають бути масивом'),
    validateRequest
];

// Маршрути
router.post(
    '/',
    authenticate,
    createBookingValidation,
    bookingController.createBooking
);

router.get(
    '/my',
    authenticate,
    bookingController.getMyBookings
);

router.get(
    '/:pnr',
    authenticate,
    param('pnr')
        .matches(/^[A-Z0-9]{6}$/)
        .withMessage('PNR має містити 6 символів (цифри та великі літери)'),
    validateRequest,
    bookingController.getBookingByPnr
);

router.patch(
    '/:id/cancel',
    authenticate,
    param('id').isUUID().withMessage('Некоректний ID бронювання'),
    body('reason').optional().isString(),
    validateRequest,
    bookingController.cancelBooking
);

router.post(
    '/:id/check-in',
    authenticate,
    param('id').isUUID(),
    validateRequest,
    bookingController.checkIn
);

router.get(
    '/:id/ticket',
    authenticate,
    param('id').isUUID(),
    validateRequest,
    bookingController.downloadTicket
);

module.exports = router;