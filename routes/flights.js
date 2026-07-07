// backend/routes/flights.js
const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const flightController = require('../controllers/flightController');
const { validateRequest } = require('../middleware/validation');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

// Валідація пошуку
const searchValidation = [
    query('origin')
        .notEmpty()
        .withMessage('Аеропорт вильоту обов\'язковий')
        .isLength({ min: 3, max: 4 })
        .withMessage('Введіть IATA код (3-4 символи)')
        .toUpperCase(),
    query('destination')
        .notEmpty()
        .withMessage('Аеропорт прибуття обов\'язковий')
        .isLength({ min: 3, max: 4 })
        .toUpperCase(),
    query('departureDate')
        .isISO8601()
        .withMessage('Введіть коректну дату (YYYY-MM-DD)')
        .custom((value) => {
            const date = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (date < today) {
                throw new Error('Дата не може бути в минулому');
            }
            return true;
        }),
    query('returnDate')
        .optional()
        .isISO8601()
        .withMessage('Введіть коректну дату повернення'),
    query('adults')
        .optional()
        .isInt({ min: 0, max: 9 })
        .withMessage('Кількість дорослих має бути від 0 до 9')
        .toInt(),
    query('children')
        .optional()
        .isInt({ min: 0, max: 8 })
        .toInt(),
    query('infants')
        .optional()
        .isInt({ min: 0, max: 8 })
        .toInt(),
    query('cabinClass')
        .optional()
        .isIn(['economy', 'premium_economy', 'business', 'first'])
        .withMessage('Невірний клас обслуговування'),
    validateRequest
];

// Маршрути
router.get(
    '/search',
    optionalAuth,
    searchValidation,
    cacheMiddleware({ duration: 60 }), // Кеш на 60 секунд
    flightController.searchFlights
);

router.get(
    '/:id',
    optionalAuth,
    flightController.getFlightDetails
);

router.get(
    '/airports/search',
    query('q').notEmpty().withMessage('Введіть пошуковий запит'),
    validateRequest,
    cacheMiddleware({ duration: 3600 }),
    flightController.searchAirports
);

router.get(
    '/airports/popular',
    cacheMiddleware({ duration: 86400 }),
    flightController.getPopularAirports
);

router.get(
    '/:id/availability',
    authenticate,
    flightController.checkAvailability
);

module.exports = router;