const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require('../modules/country-list');
const { Subscription_plan, Subscriber } = require('../models/models');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const production = process.env.NODE_ENV === "production";

router.get("/", async (req, res) => {
    const subscription_plans = await Subscription_plan.find().sort({ interval: 1, interval_count: 1 }).exec();
    res.render('subscription', { title: "Subscriptions", pagename: "subscription", subscription_plans, countries })
});

router.post("/setup", async (req, res) => {
    const { plan: id, firstname, lastname, email, address_l1, address_l2, city, country, postcode } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, address_line1: address_l1, city, country, postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]).map(k => k.replace(/_/g, " "));
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
    if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
    if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");

    try {
        const subscription_plan = await Subscription_plan.findById(id);

        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, country, postal_code: postcode }
            }
        });

        const product = await Stripe.products.create({
            name: subscription_plan.name,
            description: subscription_plan.info
        });

        const price = await Stripe.prices.create({
            product: product.id,
            unit_amount: subscription_plan.price,
            currency: "gbp",
            recurring: {
                interval: subscription_plan.interval,
                interval_count: subscription_plan.interval_count
            }
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["bacs_debit"],
            mode: "setup",
            customer: customer.id,
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
    try {
        const session = await Stripe.checkout.sessions.retrieve(session_id, { expand: ["setup_intent"] });
        const { setup_intent: intent, customer: cus_id } = session;
        const customer = await Stripe.customers.retrieve(cus_id);
        const subscription = await Stripe.subscriptions.create({
            customer: customer.id,
            default_payment_method: intent.payment_method,
            items: [{ price: price_id }]
        });

        if (production) new Subscriber({
            customer_name: customer.name,
            customer_email: customer.email,
            sub_id: subscription.id
        }).save();

        res.send(subscription);
    } catch(err) { console.error(err.message); res.status(err.statusCode || 500).send(err.message) };
});

router.get("/cancel", async (req, res) => {
    const { session_id, price_id } = req.session;
    try {
        const session = await Stripe.checkout.sessions.retrieve(session_id, { expand: ["customer", "payment_intent"] });
        const { customer, payment_intent: pi } = session;
        if (session.payment_status != "paid") await Stripe.customers.del((customer || {}).id);
        if ((pi || {}).status != "succeeded") await Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" });
        const price = await Stripe.prices.update(price_id, { active: false });
        await Stripe.products.del(price.product);
    } catch(err) { res.status(err.statusCode || 500); console.error(err.message) }
    req.session.price_id = undefined;
    req.session.session_id = undefined;
    res.render('subscription-checkout-cancel', { title: "Payment Cancelled", pagename: "subscription-checkout-cancel" });
});

module.exports = router;
