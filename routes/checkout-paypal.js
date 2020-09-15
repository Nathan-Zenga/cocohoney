const router = require('express').Router();
const paypal = require('paypal-rest-sdk');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Shipping_fee, Discount_code, Ambassador } = require('../models/models');
const { NODE_ENV, PAYPAL_CLIENT_ID, PAYPAL_SECRET } = process.env;
const production = NODE_ENV === "production";

paypal.configure({
    mode: production ? "live" : "sandbox",
    client_id: PAYPAL_CLIENT_ID,
    client_secret: PAYPAL_SECRET
});

router.post("/create-payment", async (req, res) => {
    const { discount_code, shipping_fee_id } = req.body;
    const { cart, sale, location_origin } = Object.assign(req.session, res.locals);

    try {
        var code = await Discount_code.findOne({ code: discount_code });
        var amb = req.user ? await Ambassador.findById(req.user.id) : null;
        var shipping_fee = await Shipping_fee.findById(shipping_fee_id);
        if (!code && discount_code) { res.status(404); throw Error("Invalid discount code") };
        if (!shipping_fee) { res.status(404); throw Error("Invalid shipping fee chosen") };
    } catch (err) {
        if (res.statusCode !== 404) res.status(500);
        return res.send(err.message);
    };

    const amount = cart.map(p => ({ price: amb ? p.price_amb : code || sale ? p.price_sale : p.price, qty: p.qty })).reduce((sum, p) => sum + (p.price * p.qty), 0) + shipping_fee.fee;
    const items = [
        ...cart.map(item => ({
            name: item.name,
            price: (item.price / 100).toFixed(2),
            quantity: item.qty,
            currency: "GBP"
        })),
        {
            name: `Shipping Fee - ${shipping_fee.name}`,
            price: (shipping_fee.fee / 100).toFixed(2),
            quantity: 1,
            currency: "GBP"
        }
    ];

    paypal.payment.create({
        intent: "sale",
        payer: { payment_method: "paypal" },
        redirect_urls: {
            return_url: location_origin + "/shop/checkout/paypal/complete",
            cancel_url: location_origin + "/shop/checkout/paypal/cancel"
        },
        transactions: [{
            item_list: { items },
            amount: { currency: "GBP", total: (amount / 100).toFixed(2) },
            description: "Cocohoney Cosmetics Online Store Purchase"
        }]
    }, (err, payment) => {
        req.session.amount_temp = amount;
        if (err) return res.status(err.httpStatusCode).send(`${err.message}\n${err.response.details.map(d => d.issue).join(",\n")}`);
        res.send(payment.links.filter(link => link.rel === "approval_url")[0].href);
    });
});

router.get("/complete", async (req, res) => {
    const { paymentId, PayerID, amount_temp } = Object.assign(req.query, req.session);

    paypal.payment.execute(paymentId, {
        payer_id: PayerID,
        transactions: [{ amount: { currency: "GBP", total: (amount_temp / 100).toFixed(2) } }]
    }, err => {
        if (err) return res.status(err.httpStatusCode).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: `${err.message}\n${err.response.details.map(d => d.issue).join(",\n")}`
        });

        req.session.cart = [];
        req.session.amount_temp = undefined;
        if (!production) return res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" });
        const transporter = new MailingListMailTransporter({ req, res });
        transporter.setRecipient(pi.receipt_email).sendMail({
            subject: "Purchase Nofication: Payment Successful",
            message: `Hi ${pi.shipping.name},\n\n` +
                `Your payment was successful. Below is a summary of your purchase:\n\n${pi.charges.data[0].description}\n\n` +
                `If you have not yet received your receipt via email, you can view it here instead:\n${pi.charges.data[0].receipt_url}\n\n` +
                "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) return res.status(500).send(err.message);
            res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" });
        });
    });
});

router.get("/cancel", (req, res, next) => {
    if (!req.query.token) return next();
    res.render('checkout-cancel', { title: "Payment Cancelled", pagename: "checkout-cancel" });
});

module.exports = router;
