const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const { Product, Shipping_method, Discount_code, Order } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');
const checkout_cancel = require('../modules/checkout-cancel');
const production = process.env.NODE_ENV === "production";

router.get("/", async (req, res) => {
    const { cart } = req.session;
    if (!cart.length) return res.redirect(req.get("referrer"));
    const price_total = cart.map(p => ({ price: p.price, quantity: p.qty })).reduce((sum, p) => sum + (p.price * p.quantity), 0);
    const free_delivery = price_total >= 4000;
    const query = free_delivery ? { name: "Free Delivery" } : {};
    const shipping_methods = await Shipping_method.find(query).sort({ fee: 1 }).exec();
    res.render('checkout', { title: "Checkout", pagename: "checkout", countries, shipping_methods })
});

router.post("/session/create", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, state, country, postcode, discount_code, shipping_method_id, mail_sub } = req.body;
    const { cart, location_origin, is_ambassador } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({ price: p.price, quantity: p.qty })).reduce((sum, p) => sum + (p.price * p.quantity), 0);

    try {
        const field_check = { firstname, lastname, email, "address line 1": address_l1, city, country, "post / zip code": postcode };
        if (price_total < 4000) field_check["shipping method"] = shipping_method_id;
        const missing_fields = Object.keys(field_check).filter(k => !field_check[k]);
        const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
        if (missing_fields.length) return res.status(400).send(`Missing fields: ${missing_fields.join(", ")}`);
        if (!email_pattern.test(email)) return res.status(400).send("Invalid email format");
        if (is_ambassador && discount_code) return res.status(400).send("Discount code cannot be applied as you are an ambassador");

        const dc_doc = await Discount_code.findOne({ code: discount_code, expiry_date: { $gte: Date.now() } });
        const shipping_method = price_total >= 4000 ? { name: "Free Delivery", fee: 0 } : await Shipping_method.findById(shipping_method_id);
        const non_sale_item_present = cart.filter(item => !item.sale_item).length;
        if (!dc_doc && discount_code) return res.status(404).send("Discount code invalid or expired");
        if (dc_doc && !non_sale_item_present) return res.status(400).send("Discount code cannot be applied as all your cart items are on sale");
        if (!shipping_method) return res.status(404).send("Invalid shipping fee chosen");

        const outside_range = !/GB|IE/i.test(country) && !/worldwide/i.test(shipping_method.name) && shipping_method.fee != 0;
        if (outside_range) return res.status(403).send("Shipping method not available for your country");

        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, state, country, postal_code: postcode }
            }
        });

        const coupon = !dc_doc ? null : await Stripe.coupons.create({
            name: `${dc_doc.percentage}% off (${dc_doc.code})`,
            percent_off: dc_doc.percentage,
            duration: "once"
        });

        const promotion_code = !dc_doc ? null : await Stripe.promotionCodes.create({
            coupon: coupon.id,
            code: dc_doc.code,
            customer: customer.id
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            customer: customer.id,
            payment_intent_data: { description: "Cocohoney Cosmetics Online Store Purchase" },
            line_items: cart.map(item => ({
                price_data: {
                    product_data: { name: item.name, images: item.image ? [item.image.url] : undefined },
                    unit_amount: parseInt(item.price),
                    currency: "gbp"
                },
                description: (item.items || []).map(p => `${p.qty}x ${p.name}`).join(", ") || item.info || undefined,
                quantity: item.qty
            })).concat([{
                price_data: {
                    product_data: { name: shipping_method.name },
                    unit_amount: parseInt(shipping_method.fee),
                    currency: "gbp"
                },
                description: shipping_method.info || undefined,
                quantity: 1
            }]),
            mode: "payment",
            allow_promotion_codes: !!promotion_code,
            success_url: location_origin + "/shop/checkout/session/complete",
            cancel_url: location_origin + "/shop/checkout/cancel"
        });

        req.session.checkout_session = session;
        req.session.current_dc_doc = dc_doc;
        req.session.shipping_method = shipping_method;
        req.session.mail_sub = !!mail_sub;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { console.error(err.message); res.status(err.statusCode || 500).send(err.message) };
});

router.get("/session/complete", async (req, res) => {
    const { checkout_session, cart, current_dc_doc, shipping_method, mail_sub } = req.session;
    const products = await Product.find();
    const dc_doc = current_dc_doc ? await Discount_code.findById(current_dc_doc._id) : null;
    const purchase_summary = cart.map(item => {
        const description = item.deal && item.items.length ? `(${item.items.map(i => `${i.qty}x ${i.name}`).join(", ")}) ` : "";
        return `${item.qty} X ${item.name} ${description}- £${(item.price / 100).toFixed(2)}`
    }).join("\n");

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
            shipping_method: shipping_method.name,
            destination: customer.shipping.address,
            cart,
            mail_sub
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
        req.session.checkout_session = undefined;
        req.session.mail_sub = undefined;
        if (dc_doc) {
            order.discounted = true;
            dc_doc.orders_applied.push(order.id);
            if (production) dc_doc.save();
            req.session.current_dc_doc = undefined;
        }

        if (production) await order.save();

        const transporter = new MailTransporter({ req, res });
        transporter.setRecipient({ email: customer.email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${customer.name},\n\n` +
            "Thank you for shopping with us! We are happy to confirm your payment was successful. " +
            `Here is a summery of your order:\n\n${purchase_summary}\n\n` +
            `((Click here for further details))[${res.locals.location_origin}/order/${order.id}]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
            (dc_doc ? `Discount code applied: <b>${dc_doc.code}</b> (${dc_doc.percentage}% off)\n\n` : "") +
            "A tracking number / reference will be sent to you via email as soon as possible. " +
            "In the event that there is a delay in receiving one, please do not hesitate to contact us.\n\n" +
            "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) console.error(err), res.status(500);
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer.\n\n" +
                `((VIEW ORDER SUMMARY))[${res.locals.location_origin}/order/${order.id}]\n` +
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/order/${order.id})</small>\n\n` +
                (dc_doc ? `Discount code applied: <b>${dc_doc.code}</b> (${dc_doc.percentage}% off)\n\n` : "") +
                "<b>Click below to send the customer a Tracking Number:</b>\n\n" +
                `((ADD TRACKING REF))[${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id}]\n` +
                `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id})</small>\n\n`
            }, err => {
                if (err) console.error(err); if (err && res.statusCode !== 500) res.status(500);
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    } catch(err) {
        console.error(err.message);
        const pagename = "checkout-error";
        res.status(500).render(pagename, { title: "Payment Error", pagename, error: err.message })
    }
});

router.get("/cancel", checkout_cancel, (req, res) => {
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;
