const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SK);
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Product, Shipping_fee, Discount_code, Ambassador } = require('../models/models');
const production = process.env.NODE_ENV === "production";

router.post("/payment-intent/create", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, postcode, discount_code, shipping_fee_id } = req.body;
    const { cart, sale } = Object.assign(req.session, res.locals);

    try {
        var code = await Discount_code.find({ code: discount_code });
        var amb_code = req.user ? await Ambassador.findOne(req.user.discount_code) : {};
        var shipping_fee = await Shipping_fee.findById(shipping_fee_id);
        if (!shipping_fee) { res.status(404); throw Error("Invalid shipping fee chosen") };

        const pi = await stripe.paymentIntents.create({ // Create a PaymentIntent with the order details
            receipt_email: email,
            description: cart.map(p => `${p.name} (£${parseFloat(p.price / 100).toFixed(2)} X ${p.qty})`).join(", \r\n") + `\r\n${fee.name}: ${fee.fee}`,
            amount: cart.map(p => ({ price: amb_code ? p.price_amb : code || sale ? p.price_sale : p.price, qty: p.qty })).reduce((sum, p) => sum + (p.price * p.qty), 0) + fee.fee,
            currency: "gbp",
            shipping: {
                name: firstname + " " + lastname,
                address: { line1: address_l1, line2: address_l2, city, postal_code: postcode }
            }
        });

        req.session.paymentIntentID = pi.id;
        res.send({ clientSecret: pi.client_secret, pk: process.env.STRIPE_PK });
    } catch(err) {
        if (res.statusCode === 200) res.status(500);
        res.send(err.message);
    };
});

router.post("/payment-intent/complete", (req, res) => {
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
            if (!production) return res.end();

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
                    res.end();
                });
            });
        })
    })
});

module.exports = router;
