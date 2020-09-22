const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const { Product, Shipping_method, Discount_code } = require('../models/models');
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
    const { firstname, lastname, email, address_l1, address_l2, city, postcode, discount_code, shipping_method_id } = req.body;
    const { cart, location_origin } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({ price: p.price, quantity: p.qty })).reduce((sum, p) => sum + (p.price * p.quantity), 0);

    try {
        var code_doc = await Discount_code.findOne({ code: discount_code, expiry_date: { $gte: Date.now() } });
        var shipping_method = price_total >= 4000 ? { name: "Free Delivery", fee: 0 } : await Shipping_method.findById(shipping_method_id);
        if (!code_doc && discount_code) { res.status(404); throw Error("Discount code invalid or expired") };
        if (!shipping_method) { res.status(404); throw Error("Invalid shipping fee chosen") };
    } catch (err) {
        if (res.statusCode !== 404) res.status(500);
        return res.send(err.message);
    };

    try {
        const customer = await Stripe.customers.create({
            name: firstname + " " + lastname,
            email,
            shipping: {
                name: firstname + " " + lastname,
                address: { line1: address_l1, line2: address_l2, city, postal_code: postcode }
            }
        });

        const coupon = !code_doc ? null : await Stripe.coupons.create({
            name: `${code_doc.percentage}% (${code_doc.code})`,
            percent_off: code_doc.percentage,
            duration: "once"
        });

        const promotion_code = !code_doc ? null : await Stripe.promotionCodes.create({
            coupon: coupon.id,
            code: code_doc.code
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
                description: item.info || undefined,
                quantity: item.qty
            })),
            mode: "payment",
            allow_promotion_codes: !!promotion_code,
            success_url: location_origin + "/shop/checkout/session/complete",
            cancel_url: location_origin + "/shop/checkout/cancel"
        });

        req.session.checkout_session = session;
        req.session.current_dc_object = code_doc;
        req.session.promotion_code_obj = promotion_code;
        req.session.customer = customer;
        res.send({ id: session.id, pk: process.env.STRIPE_PK });
    } catch(err) { res.status(400).send(err.message) };
});

router.get("/session/complete", async (req, res) => {
    const { checkout_session, cart, current_dc_object, promotion_code_obj } = req.session;
    const products = await Product.find();
    const code_doc = current_dc_object ? await Discount_code.findById(current_dc_object.id) : null;

    try {
        if (promotion_code_obj) await Stripe.promotionCodes.update(promotion_code_obj.id, { active: false });
        const session = await Stripe.checkout.sessions.retrieve(checkout_session.id);

        if (!session) return res.status(400).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: "Checkout session is invalid"
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
        if (code_doc) {
            if (production) { code_doc.used = true; code_doc.used_count += 1; code_doc.save() }
            req.session.current_dc_object = undefined;
        }

        res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" });
    } catch(err) {
        res.status(500).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: err.message
        })
    };
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
        if (pi.status != "succeeded") await Stripe.paymentIntents.cancel(pi.id);
    }
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;
