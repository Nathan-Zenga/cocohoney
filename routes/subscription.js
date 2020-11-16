const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const { Product } = require('../models/models');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const production = process.env.NODE_ENV === "production";

router.get("/", async (req, res) => {
    const products = await Product.find({ category: "lashes" }).sort({ product_collection: -1, _id: 1 }).exec();
    res.render('subscription', { title: "Subscriptions", pagename: "subscription", products })
});

router.post("/setup", async (req, res) => {
    const { location_origin } = res.locals;
    try {
        const product = await Stripe.products.create({
            name: "T-shirt",
            description: "Some t-shirt you get more of every month"
        });

        const price = await Stripe.prices.create({
            product: product.id,
            unit_amount: 2000,
            currency: "gbp",
            recurring: { interval: "month" }
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["bacs_debit"],
            mode: "setup",
            success_url: location_origin + "/shop/subscription/complete",
            cancel_url: location_origin + "/shop/subscription/cancel"
        });

        req.session.price_id = price.id;
        req.session.session_id = session.id;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { console.error(err.message); res.status(err.statusCode || 500).send(err.message) };
});

router.get("/complete", async (req, res) => {
    const { session_id, price_id } = req.session;
    const session = await Stripe.checkout.sessions.retrieve(session_id, { expand: ["setup_intent"] });
    const { setup_intent: intent } = session;
    const subscription = await Stripe.subscriptions.create({
        customer: intent.customer,
        default_payment_method: intent.payment_method,
        items: [{ price: price_id }]
    });

    res.send(subscription);
});

router.get("/cancel", async (req, res) => {
    const { session_id, price_id } = req.session;
    try {
        const session = await Stripe.checkout.sessions.retrieve(session_id, { expand: ["customer", "payment_intent"] });
        const { customer, payment_intent: pi } = session;
        if (session.payment_status != "paid") await Stripe.customers.del((customer || {}).id);
        if (pi.status != "succeeded") await Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" });
        const price = await Stripe.prices.update(price_id, { active: false });
        await Stripe.products.del(price.product);
    } catch(err) { console.error(err.message) }
    req.session.price_id = undefined;
    req.session.session_id = undefined;
    res.render('subscription-checkout-cancel', { title: "Payment Cancelled", pagename: "subscription-checkout-cancel" });
});

module.exports = router;
