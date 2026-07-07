// backend/models/User.js
const { pool } = require('../config/database');
const { AppError } = require('../utils/errors');

class User {
    /**
     * Знайти користувача за email
     */
    static async findByEmail(email) {
        const result = await pool.query(
            `SELECT id, email, password_hash, first_name, last_name, 
                    phone_number, language, currency, bonus_points, 
                    is_active, email_verified, role, created_at, updated_at
             FROM users 
             WHERE email = $1 AND is_active = true`,
            [email.toLowerCase()]
        );
        return result.rows[0] || null;
    }

    /**
     * Знайти користувача за ID
     */
    static async findById(id) {
        const result = await pool.query(
            `SELECT id, email, first_name, last_name, phone_number, 
                    language, currency, bonus_points, is_active, 
                    email_verified, role, created_at, updated_at
             FROM users 
             WHERE id = $1 AND is_active = true`,
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Створити нового користувача
     */
    static async create(userData) {
        const {
            email,
            password_hash,
            first_name,
            last_name,
            phone_number,
            language = 'uk',
            currency = 'USD',
            bonus_points = 0,
            is_active = true,
            email_verified = false,
            role = 'user'
        } = userData;

        const result = await pool.query(
            `INSERT INTO users (
                email, password_hash, first_name, last_name, 
                phone_number, language, currency, bonus_points,
                is_active, email_verified, role
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, email, first_name, last_name, 
                      bonus_points, is_active, email_verified`,
            [
                email.toLowerCase(),
                password_hash,
                first_name,
                last_name,
                phone_number,
                language,
                currency,
                bonus_points,
                is_active,
                email_verified,
                role
            ]
        );

        return result.rows[0];
    }

    /**
     * Оновити профіль користувача
     */
    static async update(id, updates) {
        const allowedFields = ['first_name', 'last_name', 'phone_number', 'language', 'currency'];
        const fields = [];
        const values = [];
        let paramCounter = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value !== undefined) {
                fields.push(`${key} = $${paramCounter}`);
                values.push(value);
                paramCounter++;
            }
        }

        if (fields.length === 0) {
            throw new AppError('Немає полів для оновлення', 400);
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `
            UPDATE users 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING id, email, first_name, last_name, 
                      phone_number, language, currency, bonus_points,
                      is_active, email_verified, role
        `;

        const result = await pool.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Оновити час останнього входу
     */
    static async updateLastLogin(id) {
        await pool.query(
            `UPDATE users SET last_login = NOW() WHERE id = $1`,
            [id]
        );
    }

    /**
     * Верифікувати email
     */
    static async verifyEmail(id) {
        await pool.query(
            `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
            [id]
        );
    }

    /**
     * Оновити пароль
     */
    static async updatePassword(id, hashedPassword) {
        await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [hashedPassword, id]
        );
    }

    /**
     * Зберегти токен для скидання пароля
     */
    static async setResetToken(id, hashedToken) {
        await pool.query(
            `UPDATE users 
             SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 hour'
             WHERE id = $2`,
            [hashedToken, id]
        );
    }

    /**
     * Знайти користувача за токеном скидання
     */
    static async findByResetToken(token) {
        const result = await pool.query(
            `SELECT id, email, first_name, last_name
             FROM users 
             WHERE reset_token = $1 
               AND reset_token_expires > NOW()
               AND is_active = true`,
            [token]
        );
        return result.rows[0] || null;
    }

    /**
     * Очистити токен скидання
     */
    static async clearResetToken(id) {
        await pool.query(
            `UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1`,
            [id]
        );
    }

    /**
     * Деактивувати акаунт
     */
    static async deactivate(id) {
        await pool.query(
            `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
            [id]
        );
    }

    /**
     * Додати бонусні бали
     */
    static async addBonusPoints(id, points) {
        await pool.query(
            `UPDATE users 
             SET bonus_points = bonus_points + $1, updated_at = NOW() 
             WHERE id = $2`,
            [points, id]
        );
    }
}

module.exports = User;