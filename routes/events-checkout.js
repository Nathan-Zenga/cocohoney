const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const { Order, Event } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');
const checkout_cancel = require('../modules/checkout-cancel');
const production = process.env.NODE_ENV === "production";

router.post("/session/create", async (req, res) => {
    const { event_id, quantity, firstname, lastname, email, address_l1, address_l2, city, state, country, postcode, mail_sub } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
    if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
    if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");

    try {
        const event = await Event.findOne({ _id: event_id, stock_qty: { $gte: 1 }, date: { $gte: Date.now() } });
        if (!event) return res.status(404).send("Ticket invalid or no longer available to buy");
        if (isNaN(parseInt(quantity))) return res.status(400).send("Quantity specified is not a number");
        if (quantity < 1) return res.status(400).send("Quantity specified is below the limit");
        if (quantity > event.stock_qty) return res.status(400).send("Quantity specified is over the limit");

        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, country, state, postal_code: postcode }
            }
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            customer: customer.id,
            payment_intent_data: { description: "Event Tickets Purchase" },
            line_items: [{
                price_data: {
                    product_data: { name: `'${event.title}' Event Ticket`, images: event.image ? [event.image.url] : undefined },
                    unit_amount: parseInt(event.price),
                    currency: "gbp"
                },
                quantity: parseInt(quantity)
            }],
            mode: "payment",
            success_url: location_origin + "/events/checkout/session/complete",
            cancel_url: location_origin + "/events/checkout/cancel"
        });

        req.session.event_id = event.id;
        req.session.checkout_session_id = session.id;
        req.session.mail_sub = !!mail_sub;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { console.error(err.message); res.status(err.statusCode || 500).send(err.message) };
});

router.get("/session/complete", async (req, res) => {
    const { event_id, checkout_session_id, mail_sub } = req.session;

    try {
        const event = await Event.findById(event_id);
        const id = event.id, name = event.title, price = event.price, image = event.image, info = event.info;
        const session = await Stripe.checkout.sessions.retrieve(checkout_session_id, { expand: ["customer"] });

        if (!session) return res.status(400).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: "The checkout session is invalid, expired or already completed"
        });

        const { customer } = session;
        const { quantity: qty } = session.line_items.data[0];
        const order = new Order({
            customer_name: customer.name,
            customer_email: customer.email,
            destination: customer.shipping.address,
            cart: [{ id, name: `'${name}' Event Ticket`, price, image, info, qty }],
            tracking_ref: "N/A",
            mail_sub
        });

        if (production) {
            event.stock_qty = Math.max(0, event.stock_qty - qty);
            await event.save();
            await order.save();
        };

        req.session.event_id = undefined;
        req.session.checkout_session_id = undefined;
        req.session.mail_sub = undefined;

        const transporter = new MailTransporter();
        const subject = "Ticket Payment Successful - Cocohoney Cosmetics";
        const message = `Hi ${customer.name},\n\n` +
        `Thank you for signing up to participate on our "${event.title}" event on ${event.date}! ` +
        "We are happy to confirm your ticket payment was successful.\n\n" +
        `((Click here to view order summary))[${res.locals.location_origin}/order/${order.id}]\n` +
        `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
        "Thank you for purchasing with us!\n\n- Cocohoney Cosmetics";
        transporter.setRecipient({ email: customer.email }).sendMail({ subject, message }, err => {
            if (err) console.error(err), res.status(500);
            const subject = "Purchase Report: Someone bought tickets!";
            const message = "You've received a new purchase from a new customer for a ticket for the " +
            `${event.title} event on ${event.date}.\n\n` +
            `((VIEW ORDER SUMMARY))[${res.locals.location_origin}/order/${order.id}]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n`;
            transporter.setRecipient({ email: process.env.CHC_EMAIL }).sendMail({ subject, message }, err => {
                if (err) { console.error(err); if (res.statusCode !== 500) res.status(500) }
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    } catch(err) {
        console.error(err.message);
        res.status(500).render('checkout-error', { title: "Payment Error", pagename: "checkout-error", error: err.message })
    }
});

router.get("/cancel", checkout_cancel, (req, res) => {
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;
