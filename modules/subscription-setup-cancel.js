const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);

module.exports = async (req, res, next) => {
    const { setup_session, price_id } = req.session;
    if (setup_session) try {
        const session = await Stripe.checkout.sessions.retrieve(setup_session.id, { expand: ["customer", "setup_intent"] });
        const { customer, setup_intent: si } = session;
        if (session.payment_status != "paid") await Stripe.customers.del((customer || {}).id);
        if (si.status != "succeeded") await Stripe.setupIntents.cancel(si.id, { cancellation_reason: "requested_by_customer" });
        const price = await Stripe.prices.update(price_id, { active: false });
        await Stripe.products.del(price.product);
    } catch(err) { res.status(err.statusCode || 500); console.error(err.message) }
    req.session.price_id = undefined;
    req.session.setup_session = undefined;
    next();
}