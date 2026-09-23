function createPaymentIntent({ amount, currency = 'PHP' }) {
    return {
        id: `pay_${Date.now().toString(36)}`,
        amount,
        currency,
        status: 'pending'
    };
}

module.exports = {
    createPaymentIntent
};
