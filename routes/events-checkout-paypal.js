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
    const { event_id, quantity, firstname, lastname, email, address_l1, address_l2, city, state, country, postcode, mail_sub } = req.body;
    const { location_origin } = res.locals;
    const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
    const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
    const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
    if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
    if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");

    const event = await Event.findOne({ _id: event_id, stock_qty: { $gte: 1 }, date: { $gte: Date.now() } }).catch(e => null);
    if (!event) return res.status(404).send("Ticket invalid or no longer available to buy");
    const price_total = event.price * quantity;
    if (isNaN(parseInt(quantity))) return res.status(400).send("Quantity specified is not a number");
    if (quantity < 1) return res.status(400).send("Quantity specified is below the limit");
    if (quantity > event.stock_qty) return res.status(400).send("Quantity specified is over the limit");

    paypal.payment.create({
        intent: "sale",
        payer: { payment_method: "paypal" },
        redirect_urls: {
            return_url: location_origin + "/events/checkout/paypal/complete",
            cancel_url: location_origin + "/events/checkout/cancel"
        },
        transactions: [{
            item_list: {
                items: [{
                    name: `'${event.title}' Event Ticket`,
                    price: (event.price / 100).toFixed(2),
                    quantity: parseInt(quantity),
                    currency: "GBP"
                }],
                shipping_address: {
                    recipient_name: `${firstname} ${lastname}`,
                    line1: address_l1,
                    line2: address_l2,
                    city,
                    state,
                    country_code: country,
                    postal_code: postcode
                }
            },
            amount: {
                currency: "GBP",
                total: (price_total / 100).toFixed(2),
                details: { subtotal: (price_total / 100).toFixed(2) }
            },
            description: `Event tickets for '${event.title}' on ${event.date.toDateString()}`
        }]
    }, (err, payment) => {
        if (err) return res.status(err.httpStatusCode).send(`${err.message}\n${(err.response.details || []).map(d => d.issue).join(",\n")}`);
        req.session.event_id = event.id;
        req.session.transaction = payment.transactions[0];
        req.session.mail_sub = !!mail_sub;
        res.send(payment.links.find(link => link.rel === "approval_url").href);
    });
});

router.get("/complete", async (req, res) => {
    const { paymentId, PayerID } = req.query;
    const { transaction, event_id, mail_sub } = req.session;

    try {
        const event = await Event.findById(event_id);
        const id = event.id, name = event.title, price = event.price, image = event.image, info = event.info;

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
            const { quantity: qty } = payment.transactions[0].item_list.items[0];
            const { email } = payment.payer.payer_info;
    
            const order = new Order({
                customer_name: recipient_name,
                customer_email: email,
                destination: { line1, line2, city, state, country: country_code, postal_code },
                cart: [{ id, name: `'${name}' Event Ticket`, price, image, info, qty }],
                tracking_ref: "N/A",
                mail_sub
            });
    
            if (production) {
                event.stock_qty -= qty;
                if (event.stock_qty < 0) event.stock_qty = 0;
                event.save();
                order.save();
            };
    
            req.session.event_id = undefined;
            req.session.transaction = undefined;
            req.session.mail_sub = undefined;
    
            const transporter = new MailTransporter({ req, res });
            transporter.setRecipient({ email }).sendMail({
                subject: "Ticket Payment Successful - Cocohoney Cosmetics",
                message: `Hi ${recipient_name},\n\n` +
                `Thank you for signing up to participate on our "${event.title}" event on ${event.date}! ` +
                "We are happy to confirm your ticket payment was successful.\n\n" +
                `((Click here to view order summary))[${res.locals.location_origin}/order/${order.id}]\n` +
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
                "Thank you for purchasing with us!\n\n- Cocohoney Cosmetics"
            }, err => {
                if (err) console.error(err), res.status(500);
                transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                    subject: "Purchase Report: Someone bought tickets!",
                    message: "You've received a new purchase from a new customer for a ticket for the " +
                    `${event.title} event on ${event.date}.\n\n` +
                    `((VIEW ORDER SUMMARY))[${res.locals.location_origin}/order/${order.id}]\n` +
                    `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
                    "Details of this transaction can also be found on your Paypal account."
                }, err => {
                    if (err) { console.error(err); if (res.statusCode !== 500) res.status(500) }
                    res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
                });
            });
        });
    } catch(err) {
        console.error(err.message);
        res.status(500).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: err.message
        })
    }
});

module.exports = router;
