// backend/config/database.js
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'flight_booking',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Обробка помилок підключення
pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Перевірка підключення
const connectDB = async () => {
    try {
        const client = await pool.connect();
        logger.info('✅ PostgreSQL підключено');
        client.release();
        return true;
    } catch (error) {
        logger.error('❌ Помилка підключення до PostgreSQL:', error.message);
        throw error;
    }
};

// Виконання запитів з логуванням
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            logger.warn(`Повільний запит (${duration}ms):`, text.substring(0, 100));
        }
        return result;
    } catch (error) {
        logger.error('Помилка запиту:', error.message);
        throw error;
    }
};

// Транзакції
const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    pool,
    connectDB,
    query,
    transaction
};