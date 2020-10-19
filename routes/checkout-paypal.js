const router = require('express').Router();
const paypal = require('paypal-rest-sdk');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Product, Shipping_method, Discount_code, Order } = require('../models/models');
const { NODE_ENV, PAYPAL_CLIENT_ID, PAYPAL_SECRET } = process.env;
const production = NODE_ENV === "production";

paypal.configure({
    mode: production ? "live" : "sandbox",
    client_id: PAYPAL_CLIENT_ID,
    client_secret: PAYPAL_SECRET
});

router.post("/create-payment", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, country, postcode, discount_code, shipping_method_id } = req.body;
    const { cart, location_origin, is_ambassador } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({
        price: p.price,
        quantity: p.qty
    })).reduce((sum, p) => sum + (p.price * p.quantity), 0);

    try {
        const field_check = { firstname, lastname, email, address_line1: address_l1, city, country, postcode };
        if (price_total < 4000) field_check.shipping_method = shipping_method_id;
        const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
        const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
        if (missing_fields.length) throw { status: 400, msg: `Missing fields: ${missing_fields.join(", ")}` }
        if (!email_pattern.test(email)) throw { status: 400, msg: "Invalid email format" }
        if (is_ambassador && discount_code) throw { status: 400, msg: "Discount code cannot be applied as you are an ambassador" }

        var dc_doc = await Discount_code.findOne({ code: discount_code, expiry_date: { $gte: Date.now() } });
        var shipping_method = price_total >= 4000 ? { name: "Free Delivery", fee: 0 } : await Shipping_method.findById(shipping_method_id);
        if (!dc_doc && discount_code) throw { status: 404, msg: "Discount code invalid or expired" }
        if (!shipping_method) throw { status: 404, msg: "Invalid shipping fee chosen" }

        const outside_range = !/GB|IE/i.test(country) && !/worldwide/i.test(shipping_method.name) && shipping_method.fee != 0;
        if (outside_range) throw { status: 403, msg: "Shipping method not available for your country" }
    } catch (err) {
        return res.status(err.status).send(err.msg);
    };

    const discount_rate = dc_doc ? (dc_doc.percentage / 100) * price_total : 0;

    paypal.payment.create({
        intent: "sale",
        payer: { payment_method: "paypal" },
        redirect_urls: {
            return_url: location_origin + "/shop/checkout/paypal/complete",
            cancel_url: location_origin + "/shop/checkout/cancel"
        },
        transactions: [{
            item_list: {
                items: cart.map(item => ({
                    name: item.name,
                    price: (item.price / 100).toFixed(2),
                    quantity: item.qty,
                    currency: "GBP",
                    description: item.deal ? item.items.map(p => `${p.qty}x ${p.name}`).join(", ") : item.info || undefined
                })),
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
                total: (((price_total - discount_rate) + shipping_method.fee) / 100).toFixed(2),
                details: {
                    subtotal: (price_total / 100).toFixed(2),
                    shipping: (shipping_method.fee / 100).toFixed(2),
                    shipping_discount: `-${(discount_rate / 100).toFixed(2)}`
                }
            },
            description: "Cocohoney Cosmetics Online Store Purchase"
        }]
    }, (err, payment) => {
        if (err) return res.status(err.httpStatusCode).send(`${err.message}\n${(err.response.details || []).map(d => d.issue).join(",\n")}`);
        req.session.current_dc_doc = dc_doc;
        req.session.transaction = payment.transactions[0];
        req.session.shipping_method = shipping_method;
        res.send(payment.links.find(link => link.rel === "approval_url").href);
    });
});

router.get("/complete", async (req, res) => {
    const { paymentId, PayerID } = req.query;
    const { cart, current_dc_doc, transaction, shipping_method } = req.session;
    const { user } = res.locals;
    const products = await Product.find();
    const dc_doc = current_dc_doc ? await Discount_code.findById(current_dc_doc.id) : null;

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
        const purchase_summary = payment.transactions[0].item_list.items.map(item => {
            const description = item.description ? `(${item.description}) ` : "";
            return `${item.quantity} X ${item.name} ${description}- £${item.price}`
        }).join("\n");

        const order = new Order({
            customer_name: user ? `${user.firstname} ${user.lastname}` : recipient_name,
            customer_email: user ? user.email : email,
            shipping_method: shipping_method.name,
            destination: { line1, line2, city, country: country_code, postal_code, state },
            cart
        });

        if (production) cart.forEach(item => {
            if (item.deal) {
                item.items.forEach(itm => {
                    const product = products.find(p => p.id == itm.id);
                    if (product) {
                        product.stock_qty -= itm.qty;
                        if (product.stock_qty < 0) product.stock_qty = 0;
                        product.save();
                    }
                })
            } else {
                const product = products.find(p => p.id == item.id);
                if (product) {
                    product.stock_qty -= item.qty;
                    if (product.stock_qty < 0) product.stock_qty = 0;
                    product.save();
                }
            }
        });

        req.session.cart = [];
        req.session.transaction = undefined;
        if (dc_doc) {
            order.discounted = true;
            dc_doc.orders_applied.push(order.id);
            if (production) dc_doc.save();
            req.session.current_dc_doc = undefined;
        }

        if (production) order.save();

        const transporter = new MailingListMailTransporter({ req, res });
        transporter.setRecipient({ email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${recipient_name},\n\n` +
            "Thank you for shopping with us! We are happy to confirm your payment was successful. " +
            `Here is a summery of your order:\n\n${purchase_summary}\n\n` +
            "Click below to view further details about this order:\n\n" +
            `${res.locals.location_origin}/order/${order.id}\n\n` +
            (dc_doc ? `Discount code applied: <b>${dc_doc.code}</b> (${dc_doc.percentage}% off)\n\n` : "") +
            "A tracking number / reference will be sent to you via email as soon as possible. " +
            "In the event that there is a delay in receiving one, please do not hesitate to contact us.\n\n" +
            "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) console.error(err), res.status(500);
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer.\n\n" +
                "<b>View the order summary below:</b>\n" +
                `${res.locals.location_origin}/order/${order.id}\n\n` +
                (dc_doc ? `Discount code applied: <b>${dc_doc.code}</b> (${dc_doc.percentage}% off)\n\n` : "") +
                "<b>Link to send the customer a Tracking Number:</b>\n" +
                `${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id}\n\n` +
                "Details of this transaction can also be found on your Paypal account"
            }, err => {
                if (err) console.error(err); if (err && res.statusCode !== 500) res.status(500);
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    });
});

module.exports = router;
