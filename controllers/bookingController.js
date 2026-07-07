// backend/controllers/bookingController.js
const { Booking, Passenger, Flight } = require('../models');
const { bookingService } = require('../services/bookingService');
const { paymentService } = require('../services/paymentService');
const { emailService } = require('../services/emailService');
const { cacheService } = require('../services/cacheService');
const { generatePNR } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * @desc    Створення нового бронювання
 * @route   POST /api/v1/bookings
 */
exports.createBooking = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { 
            flightId, 
            returnFlightId, 
            passengers, 
            discountCode,
            specialRequests 
        } = req.body;

        // Перевірка доступності рейсу
        const flight = await Flight.findById(flightId);
        if (!flight) {
            throw new AppError('Рейс не знайдено', 404);
        }

        if (flight.available_seats < passengers.length) {
            throw new AppError('Недостатньо вільних місць на рейсі', 400);
        }

        // Розрахунок вартості
        let totalPrice = await bookingService.calculatePrice(
            flight,
            passengers,
            returnFlightId
        );

        // Застосування знижки
        let discount = null;
        if (discountCode) {
            discount = await bookingService.validateDiscount(discountCode);
            if (discount) {
                totalPrice = bookingService.applyDiscount(totalPrice, discount);
            }
        }

        // Генерація PNR
        const pnr = generatePNR();

        // Створення бронювання
        const booking = await Booking.create({
            user_id: userId,
            pnr,
            status: 'pending',
            total_price: totalPrice,
            currency: req.user.currency || 'USD',
            booking_date: new Date(),
            departure_date: flight.departure_time,
            return_date: returnFlightId ? null : null, // Буде заповнено пізніше
            expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 хвилин
            discount_id: discount ? discount.id : null,
            payment_intent_id: null
        });

        // Створення пасажирів
        const passengerRecords = await Promise.all(
            passengers.map((p, index) => 
                Passenger.create({
                    booking_id: booking.id,
                    ...p,
                    passenger_type: p.passengerType || 'adult'
                })
            )
        );

        // Створення платіжного наміру (Stripe PaymentIntent)
        const paymentIntent = await paymentService.createPaymentIntent({
            bookingId: booking.id,
            amount: totalPrice,
            currency: booking.currency,
            customerEmail: req.user.email
        });

        // Оновлення booking з payment_intent_id
        await Booking.update(booking.id, {
            payment_intent_id: paymentIntent.id
        });

        // Логування
        logger.info(`Створено бронювання ${pnr} для користувача ${userId}`);

        // Відправка email (асинхронно)
        setImmediate(() => {
            emailService.sendBookingConfirmation(
                req.user.email,
                pnr,
                passengers,
                flight
            ).catch(err => logger.error('Помилка відправки email:', err));
        });

        res.status(201).json({
            success: true,
            data: {
                booking: {
                    id: booking.id,
                    pnr: booking.pnr,
                    status: booking.status,
                    totalPrice: booking.total_price,
                    expiresAt: booking.expires_at
                },
                passengers: passengerRecords,
                paymentIntent: {
                    clientSecret: paymentIntent.client_secret,
                    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Отримання бронювання за PNR
 * @route   GET /api/v1/bookings/:pnr
 */
exports.getBookingByPnr = async (req, res, next) => {
    try {
        const { pnr } = req.params;
        const userId = req.user.id;

        // Пошук бронювання
        const booking = await Booking.findByPnr(pnr);
        if (!booking) {
            throw new AppError('Бронювання не знайдено', 404);
        }

        // Перевірка доступу (тільки власник або адмін)
        if (booking.user_id !== userId && req.user.role !== 'admin') {
            throw new AppError('Доступ заборонено', 403);
        }

        // Отримання пасажирів
        const passengers = await Passenger.findByBookingId(booking.id);

        // Отримання деталей рейсу
        const flight = await Flight.findById(booking.flight_id);

        // Кешування результату
        const cacheKey = `booking:${pnr}`;
        await cacheService.set(cacheKey, { booking, passengers, flight }, 300);

        res.json({
            success: true,
            data: {
                booking,
                passengers,
                flight
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Отримання всіх бронювань користувача
 * @route   GET /api/v1/bookings/my
 */
exports.getMyBookings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { status, from, to, limit = 20, offset = 0 } = req.query;

        const bookings = await Booking.findByUserId(
            userId,
            { status, from, to, limit, offset }
        );

        const total = await Booking.countByUserId(userId, { status, from, to });

        res.json({
            success: true,
            data: {
                bookings,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: offset + limit < total
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Скасування бронювання
 * @route   PATCH /api/v1/bookings/:id/cancel
 */
exports.cancelBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        // Пошук бронювання
        const booking = await Booking.findById(id);
        if (!booking) {
            throw new AppError('Бронювання не знайдено', 404);
        }

        // Перевірка доступу
        if (booking.user_id !== userId && req.user.role !== 'admin') {
            throw new AppError('Доступ заборонено', 403);
        }

        // Перевірка статусу
        if (booking.status === 'cancelled') {
            throw new AppError('Бронювання вже скасовано', 400);
        }

        if (booking.status === 'completed') {
            throw new AppError('Неможливо скасувати виконане бронювання', 400);
        }

        // Скасування в системі
        const cancellationResult = await bookingService.cancelBooking(
            booking.id,
            reason || 'Скасовано користувачем'
        );

        // Якщо була оплата - повернення коштів
        let refund = null;
        if (booking.status === 'confirmed' && booking.payment_intent_id) {
            refund = await paymentService.refundPayment(booking.payment_intent_id);
        }

        logger.info(`Скасовано бронювання ${booking.pnr} для користувача ${userId}`);

        res.json({
            success: true,
            data: {
                booking: cancellationResult,
                refund: refund ? {
                    amount: refund.amount,
                    status: refund.status,
                    id: refund.id
                } : null
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Онлайн-реєстрація на рейс
 * @route   POST /api/v1/bookings/:id/check-in
 */
exports.checkIn = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const booking = await Booking.findById(id);
        if (!booking) {
            throw new AppError('Бронювання не знайдено', 404);
        }

        if (booking.user_id !== userId) {
            throw new AppError('Доступ заборонено', 403);
        }

        if (booking.status !== 'confirmed') {
            throw new AppError('Реєстрація можлива тільки для підтверджених бронювань', 400);
        }

        // Перевірка часу (реєстрація за 24 години до вильоту)
        const now = new Date();
        const departure = new Date(booking.departure_date);
        const hoursUntilDeparture = (departure - now) / (1000 * 60 * 60);

        if (hoursUntilDeparture < 1) {
            throw new AppError('Реєстрація закрита за 1 годину до вильоту', 400);
        }

        if (hoursUntilDeparture > 24) {
            throw new AppError('Реєстрація відкривається за 24 години до вильоту', 400);
        }

        const checkInResult = await bookingService.checkIn(booking.id);

        res.json({
            success: true,
            data: {
                booking: checkInResult,
                boardingPass: {
                    url: `/api/v1/bookings/${booking.id}/boarding-pass`,
                    qrCode: checkInResult.qrCode
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Завантаження електронного квитка (PDF)
 * @route   GET /api/v1/bookings/:id/ticket
 */
exports.downloadTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const booking = await Booking.findById(id);
        if (!booking) {
            throw new AppError('Бронювання не знайдено', 404);
        }

        if (booking.user_id !== userId && req.user.role !== 'admin') {
            throw new AppError('Доступ заборонено', 403);
        }

        if (booking.status !== 'confirmed' && booking.status !== 'completed') {
            throw new AppError('Квиток доступний тільки для підтверджених бронювань', 400);
        }

        // Генерація PDF (тут використовується умовна логіка)
        const pdfBuffer = await bookingService.generateTicketPDF(booking.id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ticket-${booking.pnr}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
};