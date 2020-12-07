const router = require('express').Router();
const paypal = require('paypal-rest-sdk');
const MailTransporter = require('../modules/mail-transporter');
const { Order, Event } = require('../models/models');
const { NODE_ENV, PAYPAL_CLIENT_ID, PAYPAL_SECRET } = process.env;
const production = NODE_ENV === "production";

paypal.configure({
    mode: production ? "live" : "sandbox",
    client_id: PAYPAL_CLIENT_ID,
    client_secret: PAYPAL_SECRET
});

router.post("/create-payment", async (req, res) => {
    const { event_id, firstname, lastname, email, address_l1, address_l2, city, country, postcode } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
    if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
    if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");

    try { var event = await Event.findById(event_id) } catch(err) { return res.status(400).send(err.message) }
    if (!event) return res.status(404).send("Invalid / expired ticketv or the event has passed");

    paypal.payment.create({
        intent: "sale",
        payer: { payment_method: "paypal" },
        redirect_urls: {
            return_url: location_origin + "/shop/checkout/paypal/complete",
            cancel_url: location_origin + "/shop/checkout/cancel"
        },
        transactions: [{
            item_list: {
                items: [{
                    name: event.name,
                    price: (event.price / 100).toFixed(2),
                    quantity: 1,
                    currency: "GBP",
                    description: event.info || undefined
                }],
                shipping_address: {
                    recipient_name: `${firstname} ${lastname}`,
                    line1: address_l1,
                    line2: address_l2,
                    city,
                    country_code: country,
                    postal_code: postcode
                }
            },
            amount: {
                currency: "GBP",
                total: (event.price / 100).toFixed(2),
                details: { subtotal: (event.price / 100).toFixed(2) }
            },
            description: `Event Tickets for ${event.title} (£${(event.price / 100).toFixed(2)}) on ${event.date.toDateString()}`
        }]
    }, (err, payment) => {
        if (err) return res.status(err.httpStatusCode).send(`${err.message}\n${(err.response.details || []).map(d => d.issue).join(",\n")}`);
        req.session.event_id = event.id;
        req.session.transaction = payment.transactions[0];
        res.send(payment.links.find(link => link.rel === "approval_url").href);
    });
});

router.get("/complete", async (req, res) => {
    const { paymentId, PayerID } = req.query;
    const { transaction, event_id } = req.session;
    const event = await Event.findById(event_id);
    const id = event.id, name = event.title, price = event.price, image = event.image, info = event.info, qty = 1;

    paypal.payment.execute(paymentId, {
        payer_id: PayerID,
        transactions: [{ amount: transaction.amount }]
    }, (err, payment) => {
        if (err) return res.status(err.httpStatusCode).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: `${err.message}\n${(err.response.details || []).map(d => d.issue).join(",\n") || err.response.message}`
        });

        const { recipient_name, line1, line2, city, country_code, state, postal_code } = payment.transactions[0].item_list.shipping_address;
        const { email } = payment.payer.payer_info;

        const order = new Order({
            customer_name: recipient_name,
            customer_email: email,
            destination: { line1, line2, city, country: country_code, postal_code, state },
            cart: [{ id, name, price, image, info, qty }]
        });

        req.session.cart = [];
        req.session.transaction = undefined;

        if (production) order.save();

        const transporter = new MailTransporter({ req, res });
        transporter.setRecipient({ email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${recipient_name},\n\n` +
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
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id})</small>\n\n` +
                "Details of this transaction can also be found on your Paypal account."
            }, err => {
                if (err) { console.error(err); if (res.statusCode !== 500) res.status(500) }
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    });
});

module.exports = router;
