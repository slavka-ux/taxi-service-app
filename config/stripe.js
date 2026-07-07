// backend/config/stripe.js
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    maxNetworkRetries: 2,
    timeout: 30000
});

/**
 * Створення PaymentIntent
 */
const createPaymentIntent = async ({ amount, currency = 'usd', customerEmail, metadata = {} }) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe працює в копійках/центах
            currency: currency.toLowerCase(),
            receipt_email: customerEmail,
            metadata,
            automatic_payment_methods: {
                enabled: true,
            },
            capture_method: 'automatic',
            confirmation_method: 'automatic'
        });

        return paymentIntent;
    } catch (error) {
        console.error('Stripe PaymentIntent error:', error);
        throw error;
    }
};

/**
 * Підтвердження платежу
 */
const confirmPayment = async (paymentIntentId) => {
    try {
        const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);
        return paymentIntent;
    } catch (error) {
        console.error('Stripe confirm error:', error);
        throw error;
    }
};

/**
 * Повернення коштів
 */
const refundPayment = async (paymentIntentId, amount = null) => {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount ? Math.round(amount * 100) : undefined
        });
        return refund;
    } catch (error) {
        console.error('Stripe refund error:', error);
        throw error;
    }
};

/**
 * Отримання деталей платежу
 */
const getPayment = async (paymentIntentId) => {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        return paymentIntent;
    } catch (error) {
        console.error('Stripe retrieve error:', error);
        throw error;
    }
};

/**
 * Валідація webhook
 */
const constructWebhookEvent = (payload, signature) => {
    try {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
        return event;
    } catch (error) {
        console.error('Webhook signature verification failed:', error);
        throw error;
    }
};

module.exports = {
    stripe,
    createPaymentIntent,
    confirmPayment,
    refundPayment,
    getPayment,
    constructWebhookEvent
};