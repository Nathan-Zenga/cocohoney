const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const { Order, Event } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');
const production = process.env.NODE_ENV === "production";

router.post("/session/create", async (req, res) => {
    const { event_id, firstname, lastname, email, address_l1, address_l2, city, country, postcode } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
    if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
    if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");

    try {
        const event = await Event.findById(event_id);
        if (!event) return res.status(404).send("Invalid / expired ticketv or the event has passed");

        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, country, postal_code: postcode }
            }
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            customer: customer.id,
            payment_intent_data: { description: "Event Tickets Purchase" },
            line_items: [{
                price_data: {
                    product_data: { name: event.title, images: event.image ? [event.image.url] : undefined },
                    unit_amount: parseInt(event.price),
                    currency: "gbp"
                },
                description: event.info || undefined,
                quantity: 1
            }],
            mode: "payment",
            success_url: location_origin + "/events/checkout/session/complete",
            cancel_url: location_origin + "/events/checkout/cancel"
        });

        req.session.event_id = event.id;
        req.session.checkout_session = session;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { console.error(err.message); res.status(err.statusCode || 500).send(err.message) };
});

router.get("/session/complete", async (req, res) => {
    const { event_id, checkout_session } = req.session;
    const event = await Event.findById(event_id);
    const id = event.id, name = event.title, price = event.price, image = event.image, info = event.info, qty = 1;

    try {
        const session = await Stripe.checkout.sessions.retrieve(checkout_session.id, { expand: ["customer"] });
        const { customer } = session;

        if (!session) return res.status(400).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: "The checkout session is invalid, expired or already completed"
        });

        const order = new Order({
            customer_name: customer.name,
            customer_email: customer.email,
            destination: customer.shipping.address,
            cart: [{ id, name, price, image, info, qty }]
        });

        req.session.cart = [];
        req.session.checkout_session = undefined;

        if (production) order.save();

        const transporter = new MailTransporter({ req, res });
        transporter.setRecipient({ email: customer.email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${customer.name},\n\n` +
            "Thank you for shopping with us! We are happy to confirm your ticket payment was successful.\n\n" +
            `((Click here to view order summary))[${res.locals.location_origin}/order/${order.id}]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
            "Thank you for purchasing with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) console.error(err), res.status(500);
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer.\n\n" +
                `((VIEW ORDER SUMMARY))[${res.locals.location_origin}/order/${order.id}]\n` +
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
                "<b>Click below to send the customer a Tracking Number:</b>\n\n" +
                `((ADD TRACKING REF))[${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id}]\n` +
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id})</small>\n\n`
            }, err => {
                if (err) { console.error(err); if (res.statusCode !== 500) res.status(500) }
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    } catch(err) {
        console.error(err.message || err);
        res.status(500).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: err.message
        })
    }
});

router.get("/cancel", async (req, res) => {
    const { checkout_session } = req.session;
    try {
        if (checkout_session) {
            const session = await Stripe.checkout.sessions.retrieve(checkout_session.id, { expand: ["customer", "payment_intent"] });
            const { customer, payment_intent: pi } = session;
            if (session.payment_status != "paid") await Stripe.customers.del((customer || {}).id);
            if (pi.status != "succeeded") await Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" });
        }
    } catch(err) {}
    req.session.checkout_session = undefined;
    req.session.shipping_method = undefined;
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;