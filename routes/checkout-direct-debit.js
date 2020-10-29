const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const production = process.env.NODE_ENV === "production";

router.get("/", async (req, res) => {
    res.render('checkout-direct-debit', { title: "Checkout", pagename: "checkout-direct-debit", countries })
});

router.post("/setup", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, country, postcode } = req.body;
    const { location_origin } = res.locals;
    try {
        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, country, postal_code: postcode }
            }
        });

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
            customer: customer.id,
            success_url: location_origin + "/shop/checkout/direct-debit/complete",
            cancel_url: location_origin + "/shop/checkout/cancel"
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

module.exports = router;
