function createPaymentIntent({ amount, currency = 'PHP' }) {
    if (!amount || amount <= 0) {
        const error = new Error('Payment amount must be greater than zero.');
        error.status = 400;
        throw error;
    }

    const error = new Error(`Payment provider is not configured for ${currency}.`);
    error.status = 501;
    throw error;
}

module.exports = {
    createPaymentIntent
};
