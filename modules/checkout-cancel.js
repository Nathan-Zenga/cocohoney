const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);

module.exports = async (req, res, next) => {
    const { checkout_session } = req.session;
    if (checkout_session) try {
        const session = await Stripe.checkout.sessions.retrieve(checkout_session.id, { expand: ["customer", "payment_intent"] });
        const { customer, payment_intent: pi } = session;
        if (session.payment_status != "paid") await Stripe.customers.del(customer?.id);
        if (pi.status != "succeeded") await Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" });
    } catch(err) {}
    req.session.event_id = undefined; // for event ticket purchases
    req.session.checkout_session = undefined;
    req.session.current_dc_doc = undefined;
    req.session.shipping_method = undefined;
    req.session.mail_sub = undefined;
    next();
}