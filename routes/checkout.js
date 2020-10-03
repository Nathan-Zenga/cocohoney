const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const { Product, Shipping_method, Discount_code, Order } = require('../models/models');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const production = process.env.NODE_ENV === "production";

router.get("/", (req, res) => {
    const { cart } = req.session;
    if (!cart.length) return res.redirect(req.get("referrer"));
    const price_total = cart.map(p => ({ price: p.price, quantity: p.qty })).reduce((sum, p) => sum + (p.price * p.quantity), 0);
    const free_delivery = price_total >= 4000;
    const query = free_delivery ? { name: "Free Delivery" } : {};
    Shipping_method.find(query).sort({ fee: 1 }).exec((err, shipping_methods) => {
        res.render('checkout', { title: "Checkout", pagename: "checkout", countries, shipping_methods })
    })
});

router.post("/session/create", async (req, res) => {
    const { address_l1, address_l2, city, country, postcode, discount_code, shipping_method_id } = req.body;
    const { firstname, lastname, email } = res.locals.user || req.body;
    const { cart, location_origin } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({ price: p.price, quantity: p.qty })).reduce((sum, p) => sum + (p.price * p.quantity), 0);

    try {
        const field_check = { email, address_l1, city, country, postcode, shipping_method_id };
        const missing_values = Object.keys(field_check).filter(k => !field_check[k].trim());
        const email_pattern = /^(?:[a-z0-9!#$%&'*+=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
        if (missing_values.length) { res.status(400); throw Error(`Missing fields: ${missing_values.join(", ")}`) }
        if (!email_pattern.test(email)) { res.status(400); throw Error("Invalid email format") }

        var dc_doc = await Discount_code.findOne({ code: discount_code, expiry_date: { $gte: Date.now() } });
        var shipping_method = price_total >= 4000 ? { name: "Free Delivery", fee: 0 } : await Shipping_method.findById(shipping_method_id);
        if (!dc_doc && discount_code) { res.status(404); throw Error("Discount code invalid or expired") }
        if (dc_doc && dc_doc.max_reached) { res.status(400); throw Error("This discount code can no longer be applied") }
        if (!shipping_method) { res.status(404); throw Error("Invalid shipping fee chosen") }
        let outside_range = !/GB|IE/i.test(country) && !/worldwide/i.test(shipping_method.name);
        if (outside_range) { res.status(403); throw Error("Shipping method not available for your country") }
    } catch (err) {
        if (res.statusCode === 200) res.status(500);
        return res.send(err.message);
    };

    try {
        const customer = await Stripe.customers.create({
            name: `${firstname} ${lastname}`,
            email,
            shipping: {
                name: `${firstname} ${lastname}`,
                address: { line1: address_l1, line2: address_l2, city, country, postal_code: postcode }
            }
        });

        const coupon = !dc_doc ? null : await Stripe.coupons.create({
            name: `${dc_doc.percentage}% off (${dc_doc.code})`,
            percent_off: dc_doc.percentage,
            duration: "once"
        });

        const promotion_code = !dc_doc ? null : await Stripe.promotionCodes.create({
            coupon: coupon.id,
            code: dc_doc.code
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            customer: customer.id,
            payment_intent_data: {
                description: "Cocohoney Cosmetics Online Store Purchase"
            },
            line_items: cart.map(item => ({
                price_data: {
                    product_data: { name: item.name },
                    unit_amount: item.price,
                    currency: "gbp"
                },
                description: item.deal ? item.items.map(p => `${p.qty}x ${p.name}`).join(", ") : item.info || undefined,
                quantity: item.qty
            })).concat([{
                price_data: {
                    product_data: { name: shipping_method.name },
                    unit_amount: shipping_method.fee,
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
        req.session.current_dc_object = dc_doc;
        req.session.promotion_code_obj = promotion_code;
        req.session.customer = customer;
        req.session.shipping_method = shipping_method;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { res.status(400).send(err.message) };
});

router.get("/session/complete", async (req, res) => {
    const { checkout_session, customer, cart, current_dc_object, promotion_code_obj, shipping_method } = req.session;
    const products = await Product.find();
    const dc_doc = current_dc_object ? await Discount_code.findById(current_dc_object.id) : null;
    const purchase_summary = cart.map(item => {
        const description = item.deal ? `(${item.items.map(i => `${i.qty}x ${i.name}`).join(", ")}) ` : "";
        return `${item.qty} X ${item.name} ${description}- £${(item.price / 100).toFixed(2)}`
    }).join("\n");

    try {
        if (promotion_code_obj) await Stripe.promotionCodes.update(promotion_code_obj.id, { active: false });
        const session = await Stripe.checkout.sessions.retrieve(checkout_session.id);
        const customer_found = await Stripe.customers.retrieve(customer.id);

        if (!session) return res.status(400).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: "The checkout session is invalid, expired or already completed"
        });

        const order = new Order({
            customer_name: customer_found.name,
            customer_email: customer_found.email,
            shipping_method: shipping_method.name,
            destination: customer_found.shipping.address,
            cart
        });

        if (production) cart.forEach(item => {
            const product = products.filter(p => p.id === item.id)[0];
            if (product) {
                product.stock_qty -= item.qty;
                if (product.stock_qty < 0) product.stock_qty = 0;
                product.save();
            }
        });

        req.session.cart = [];
        req.session.checkout_session = undefined;
        if (dc_doc) {
            order.discounted = true;
            dc_doc.orders_applied.push(order.id);
            dc_doc.save();
            req.session.current_dc_object = undefined;
        }

        order.save();

        const transporter = new MailingListMailTransporter({ req, res });
        transporter.setRecipient({ email: customer_found.email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${customer_found.name},\n\n` +
            `Your payment was successful. Below is a summary of your purchase:\n\n${purchase_summary}\n\n` +
            "If you have not yet received your PayPal receipt via email, do not hesistate to contact us.\n\n" +
            "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            const { line1, line2, city, postal_code } = customer_found.shipping.address;
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer. Summary shown below\n\n" +
                `- Name: ${customer_found.name}\n- Email: ${customer_found.email}\n` +
                `- Purchased items:\n\n${purchase_summary}\n\n` +
                `- Address:\n\n${ (line1 + "\n" + line2).trim() }\n${city},\n${postal_code}\n\n` +
                `- Date of purchase: ${Date(order.created_at)}\n` +
                `- Total amount: £${(session.amount_total / 100).toFixed(2)}\n\n` +
                "<b>LINK TO SUBMIT A TRACKING NUMBER:</b>\n" +
                `${res.locals.location_origin}/shipping/tracking/ref/send?id=${order.id}\n\n`
            }, err2 => {
                if (err) console.error(err || err2), res.status(500);
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    } catch(err) {
        res.status(500).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: err.message
        })
    }
});

router.get("/cancel", async (req, res) => {
    const { customer, checkout_session, promotion_code_obj } = req.session;
    if (promotion_code_obj) {
        await Stripe.promotionCodes.update(promotion_code_obj.id, { active: false });
        req.session.promotion_code_obj = undefined;
    }
    if (customer && checkout_session) {
        const session = await Stripe.checkout.sessions.retrieve(checkout_session.id);
        const pi = await Stripe.paymentIntents.retrieve(session.payment_intent);
        if (session.payment_status != "paid") await Stripe.customers.del(customer.id);
        if (pi.status != "succeeded") await Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" });
    }
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;
