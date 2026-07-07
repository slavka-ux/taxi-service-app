// backend/middleware/errorHandler.js
const logger = require('../utils/logger');

/**
 * Глобальний обробник помилок
 */
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Логування помилки
    logger.error({
        message: err.message,
        stack: err.stack,
        status: statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    // Відповідь клієнту
    const response = {
        success: false,
        error: err.message || 'Внутрішня помилка сервера'
    };

    // Додаткові дані для валідаційних помилок
    if (err.errors && Array.isArray(err.errors)) {
        response.errors = err.errors;
    }

    // Деталі для development середовища
    if (isDevelopment) {
        response.stack = err.stack;
        response.details = err.details || null;
    }

    res.status(statusCode).json(response);
};

/**
 * Обробка помилок бази даних
 */
const handleDatabaseError = (err) => {
    // PostgreSQL помилки
    if (err.code) {
        switch (err.code) {
            case '23505': // Unique violation
                return new AppError('Запис з такими даними вже існує', 409);
            case '23503': // Foreign key violation
                return new AppError('Пов\'язаний запис не знайдено', 404);
            case '42P01': // Table not found
                return new AppError('Таблиця не знайдена', 500);
            default:
                return new AppError('Помилка бази даних', 500);
        }
    }
    return err;
};

/**
 * AppError клас для кастомних помилок
 */
class AppError extends Error {
    constructor(message, statusCode, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = {
    errorHandler,
    handleDatabaseError,
    AppError
};