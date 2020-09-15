const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Product, Shipping_fee, Discount_code, Ambassador } = require('../models/models');
const production = process.env.NODE_ENV === "production";

router.get("/", (req, res) => {
    if (!req.session.cart.length) return res.redirect(req.get("referrer"));
    Shipping_fee.find().sort({ fee: 1 }).exec((err, shipping_fees) => {
        res.render('checkout', { title: "Checkout", pagename: "checkout", countries, shipping_fees })
    })
});

router.post("/payment-intent/create", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, postcode, discount_code, shipping_fee_id } = req.body;
    const { cart, sale } = Object.assign(req.session, res.locals);

    try {
        var code = await Discount_code.find({ code: discount_code });
        var amb = req.user ? await Ambassador.findById(req.user.id) : {};
        var shipping_fee = await Shipping_fee.findById(shipping_fee_id);
        if (!shipping_fee) { res.status(404); throw Error("Invalid shipping fee chosen") };
    } catch(err) {
        if (res.statusCode !== 404) res.status(500);
        return res.send(err.message);
    };

    stripe.paymentIntents.create({
        receipt_email: email,
        description: cart.map(p => `${p.name} (£${parseFloat(p.price / 100).toFixed(2)} X ${p.qty})`).join(", \r\n") + `\r\n${shipping_fee.name}: ${(shipping_fee.fee / 100).toFixed(2)}`,
        amount: cart.map(p => ({ price: amb ? p.price_amb : code || sale ? p.price_sale : p.price, qty: p.qty })).reduce((sum, p) => sum + (p.price * p.qty), 0) + shipping_fee.fee,
        currency: "gbp",
        shipping: {
            name: firstname + " " + lastname,
            address: { line1: address_l1, line2: address_l2, city, postal_code: postcode }
        }
    }, (err, pi) => {
        if (err) return res.status(400).send(err.message);
        req.session.paymentIntentID = pi.id;
        res.send({ clientSecret: pi.client_secret, pk: process.env.STRIPE_PK });
    });
});

router.post("/payment-intent/complete", (req, res) => {
    const success_message = "<h1>Payment Successful</h1><p>A reciept has been forwarded to your email address.</p><p>Thank you for your purchase!</p>";
    stripe.paymentIntents.retrieve(req.session.paymentIntentID, (err, pi) => {
        if (err || !pi) return res.status(err ? 500 : 400).send("Error occurred");
        if (pi.status !== "succeeded") return res.status(500).send(pi.status.replace(/_/g, " "));
        Product.find((err, products) => {
            if (production) req.session.cart.forEach(item => {
                const product = products.filter(p => p.id === item.id)[0];
                if (product) {
                    product.stock_qty -= item.qty;
                    if (product.stock_qty < 0) product.stock_qty = 0;
                    product.save();
                }
            });
            req.session.cart = [];
            req.session.paymentIntentID = undefined;
            if (!production) return res.send(success_message);

            const transporter = new MailingListMailTransporter({ req, res });
            transporter.setRecipient(pi.receipt_email).sendMail({
                subject: "Purchase Nofication: Payment Successful",
                message: `Hi ${pi.shipping.name},\n\n` +
                    `Your payment was successful. Below is a summary of your purchase:\n\n${pi.charges.data[0].description}\n\n` +
                    `If you have not yet received your receipt via email, you can view it here instead:\n${pi.charges.data[0].receipt_url}\n\n` +
                    "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
            }, err => {
                const { line1, line2, city, postal_code } = pi.address;
                transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                    subject: "Purchase Report: You Got Paid!",
                    message: "You've received a new purchase from a new customer. Summary shown below\n\n" +
                        `- Name: ${pi.shipping.name}\n- Email: ${pi.receipt_email}\n- Purchased items: ${pi.charges.data[0].description}\n` +
                        `- Address:\n\t${line1},${line2 ? "\n\t"+line2+"," : ""}\n\t${city},\n\t${postal_code}\n\n` +
                        `- Date of purchase: ${Date(pi.created * 1000)}\n- Total amount: £${pi.amount / 100}-\n\n`
                        `- And finally, a copy of their receipt:\n${pi.charges.data[0].receipt_url}`
                }, err2 => {
                    const error = err || err2;
                    if (error) return res.status(500).send(error.message || (err || "")+" / "+(err2 || ""));
                    res.send(success_message);
                });
            });
        })
    })
});

module.exports = router;
