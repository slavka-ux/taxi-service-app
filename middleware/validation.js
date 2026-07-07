// backend/middleware/validation.js
const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

/**
 * Валідація запиту
 */
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => ({
            field: err.param,
            message: err.msg
        }));

        throw new AppError('Помилка валідації', 400, errorMessages);
    }
    next();
};

/**
 * Валідація ID (перевірка чи це UUID)
 */
const validateUUID = (req, res, next) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const id = req.params.id || req.params.bookingId;

    if (id && !uuidRegex.test(id)) {
        throw new AppError('Некоректний формат ID', 400);
    }

    next();
};

/**
 * Валідація PNR
 */
const validatePNR = (req, res, next) => {
    const pnrRegex = /^[A-Z0-9]{6}$/;
    const pnr = req.params.pnr;

    if (pnr && !pnrRegex.test(pnr)) {
        throw new AppError('PNR має містити 6 символів (цифри та великі літери)', 400);
    }

    next();
};

/**
 * Валідація дати (формат ISO)
 */
const validateDate = (req, res, next) => {
    const { date } = req.query;
    if (date) {
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            throw new AppError('Некоректний формат дати. Використовуйте YYYY-MM-DD', 400);
        }
    }
    next();
};

/**
 * Валідація пасажирів
 */
const validatePassengers = (req, res, next) => {
    const { passengers } = req.body;
    if (passengers) {
        if (!Array.isArray(passengers) || passengers.length === 0) {
            throw new AppError('Мінімум 1 пасажир', 400);
        }

        if (passengers.length > 9) {
            throw new AppError('Максимум 9 пасажирів на одне бронювання', 400);
        }

        // Перевірка кожного пасажира
        const requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'documentType', 'documentNumber'];
        for (const [index, passenger] of passengers.entries()) {
            for (const field of requiredFields) {
                if (!passenger[field]) {
                    throw new AppError(`Поле "${field}" обов\'язкове для пасажира ${index + 1}`, 400);
                }
            }
        }
    }
    next();
};

module.exports = {
    validateRequest,
    validateUUID,
    validatePNR,
    validateDate,
    validatePassengers
};