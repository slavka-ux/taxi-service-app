// backend/models/Booking.js
const { pool } = require('../config/database');

class Booking {
    /**
     * Створити бронювання
     */
    static async create(bookingData) {
        const {
            user_id,
            pnr,
            status = 'pending',
            total_price,
            currency = 'USD',
            booking_date,
            departure_date,
            return_date,
            expires_at,
            discount_id = null,
            payment_intent_id = null,
            flight_id,
            return_flight_id = null
        } = bookingData;

        const result = await pool.query(
            `INSERT INTO bookings (
                user_id, pnr, status, total_price, currency,
                booking_date, departure_date, return_date,
                expires_at, discount_id, payment_intent_id,
                flight_id, return_flight_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, pnr, status, total_price, currency,
                      booking_date, departure_date, expires_at`,
            [
                user_id, pnr, status, total_price, currency,
                booking_date, departure_date, return_date,
                expires_at, discount_id, payment_intent_id,
                flight_id, return_flight_id
            ]
        );

        return result.rows[0];
    }

    /**
     * Знайти бронювання за ID
     */
    static async findById(id) {
        const result = await pool.query(
            `SELECT b.*, 
                    u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name
             FROM bookings b
             LEFT JOIN users u ON b.user_id = u.id
             WHERE b.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Знайти бронювання за PNR
     */
    static async findByPnr(pnr) {
        const result = await pool.query(
            `SELECT b.*, 
                    u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name
             FROM bookings b
             LEFT JOIN users u ON b.user_id = u.id
             WHERE b.pnr = $1`,
            [pnr.toUpperCase()]
        );
        return result.rows[0] || null;
    }

    /**
     * Отримати бронювання користувача
     */
    static async findByUserId(userId, options = {}) {
        const { status, from, to, limit = 20, offset = 0 } = options;

        let query = `
            SELECT b.*, f.flight_number, f.departure_airport, f.arrival_airport,
                   f.departure_time as flight_departure, f.arrival_time as flight_arrival
            FROM bookings b
            LEFT JOIN flights f ON b.flight_id = f.id
            WHERE b.user_id = $1
        `;
        const params = [userId];
        let paramCounter = 2;

        if (status) {
            query += ` AND b.status = $${paramCounter}`;
            params.push(status);
            paramCounter++;
        }

        if (from) {
            query += ` AND b.booking_date >= $${paramCounter}`;
            params.push(from);
            paramCounter++;
        }

        if (to) {
            query += ` AND b.booking_date <= $${paramCounter}`;
            params.push(to);
            paramCounter++;
        }

        query += ` ORDER BY b.booking_date DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Підрахунок кількості бронювань користувача
     */
    static async countByUserId(userId, options = {}) {
        const { status, from, to } = options;

        let query = `SELECT COUNT(*) FROM bookings WHERE user_id = $1`;
        const params = [userId];
        let paramCounter = 2;

        if (status) {
            query += ` AND status = $${paramCounter}`;
            params.push(status);
            paramCounter++;
        }

        if (from) {
            query += ` AND booking_date >= $${paramCounter}`;
            params.push(from);
            paramCounter++;
        }

        if (to) {
            query += ` AND booking_date <= $${paramCounter}`;
            params.push(to);
            paramCounter++;
        }

        const result = await pool.query(query, params);
        return parseInt(result.rows[0].count);
    }

    /**
     * Оновити статус бронювання
     */
    static async updateStatus(id, status, metadata = {}) {
        const fields = ['status = $1', 'updated_at = NOW()'];
        const values = [status];
        let paramCounter = 2;

        if (status === 'confirmed') {
            fields.push(`confirmed_at = NOW()`);
        }

        if (status === 'cancelled') {
            fields.push(`cancelled_at = NOW()`);
            if (metadata.cancellation_reason) {
                fields.push(`cancellation_reason = $${paramCounter}`);
                values.push(metadata.cancellation_reason);
                paramCounter++;
            }
        }

        values.push(id);

        const query = `
            UPDATE bookings 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `;

        const result = await pool.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Оновити бронювання
     */
    static async update(id, updates) {
        const allowedFields = [
            'status', 'total_price', 'payment_intent_id', 
            'confirmed_at', 'cancelled_at', 'cancellation_reason'
        ];
        
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
            return null;
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `
            UPDATE bookings 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `;

        const result = await pool.query(query, values);
        return result.rows[0] || null;
    }

    /**
     * Знайти прострочені бронювання (pending > expires_at)
     */
    static async findExpiredBookings() {
        const result = await pool.query(
            `SELECT b.*, u.email, u.first_name, u.last_name
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             WHERE b.status = 'pending' 
               AND b.expires_at < NOW()
               AND b.booking_date >= NOW() - INTERVAL '7 days'`,
        );
        return result.rows;
    }

    /**
     * Отримати бронювання для звітів
     */
    static async getReportStats(fromDate, toDate) {
        const result = await pool.query(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END), 0) as revenue
             FROM bookings
             WHERE booking_date BETWEEN $1 AND $2`,
            [fromDate, toDate]
        );
        return result.rows[0];
    }
}

module.exports = Booking;