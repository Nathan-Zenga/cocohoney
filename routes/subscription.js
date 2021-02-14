const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const { stringify } = require('querystring');
const countries = require('../modules/country-list');
const { Subscription_plan, Subscriber, Subscription_page } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');

router.get("/", async (req, res) => {
    const subscription_plans = await Subscription_plan.find().sort({ interval: 1, interval_count: 1 }).exec();
    const { info } = (await Subscription_page.find())[0];
    res.render('subscription', { title: "Subscriptions", pagename: "subscription", info, subscription_plans, countries })
});

router.post("/setup", async (req, res) => {
    if (!req.user) return res.status(401).send({ qs: stringify(req.body) });
    const { plan: id, firstname, lastname, email, address_l1, address_l2, city, country, postcode } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
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
            name: subscription_plan.name + " Lash Subscription",
            description: subscription_plan.info,
            images: subscription_plan.image.url ? [subscription_plan.image.url] : undefined
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
        const { setup_intent, customer } = await Stripe.checkout.sessions.retrieve(session_id, { expand: ["setup_intent", "customer"] });
        const { recurring } = await Stripe.prices.retrieve(price_id);
        const first_charge_date = new Date();
        const interval_count = recurring.interval_count * (recurring.interval === "year" ? 12 : 1);
        first_charge_date.setMonth( first_charge_date.getMonth() + (first_charge_date.getDate() > 3 ? interval_count : 0) );
        first_charge_date.setDate(3);

        const subscription = await Stripe.subscriptions.create({
            customer: customer.id,
            default_payment_method: setup_intent.payment_method,
            items: [{ price: price_id }],
            billing_cycle_anchor: Math.round(first_charge_date.getTime() / 1000)
        });
        const product = await Stripe.products.retrieve(subscription.items.data[0].price.product);
        const invoice = await Stripe.invoices.retrieve(subscription.latest_invoice);

        await Subscriber.create({
            customer: { member_id: (req.user || {})._id, name: customer.name, email: customer.email },
            sub_id: subscription.id
        });

        req.session.checkout_session = undefined;
        req.session.price_id = undefined;

        const transporter = new MailTransporter({ req, res });
        transporter.setRecipient(customer).sendMail({
            subject: "Subscription Sign-up & Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${customer.name},\n\n` +
            "Thank you for signing up to one of our Monthly Lashes Subscriptions! " +
            "We are happy to confirm your sign-up and payment was successful. " +
            `Here is a summery of your order:\n\n${product.name} (£${(product.price / 100).toFixed(2)})\n\n` +
            "Click below to view further details about this order:\n\n" +
            `((INVOICE SUMMARY))[${invoice.hosted_invoice_url}]\n` +
            `<small>(Copy the URL if the above link is not working - ${invoice.hosted_invoice_url})</small>\n\n` +
            "Please note that you can view AND edit all of your subscriptions details on your account when you are logged in.\n\n" +
            "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) console.error(err), res.status(500);
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer.\n\n" +
                "<b>View the order summary below:</b>\n" +
                `((INVOICE SUMMARY))[${invoice.hosted_invoice_url}]\n` +
                `<small>(Copy the URL if the above link is not working - ${invoice.hosted_invoice_url})</small>`
            }, err => {
                if (err) console.error(err); if (err && res.statusCode !== 500) res.status(500);
                res.render('subscription-checkout-success', { title: "Subscription Payment Successful", pagename: "subscription-checkout-success" })
            });
        });
    } catch(err) {
        console.error(err.message);
        res.status(err.statusCode || 500).render('checkout-error', { title: "Payment Error", pagename: "checkout-error", error: err.message })
    };
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
