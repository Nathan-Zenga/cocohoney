const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const MailingListMailTransporter = require("../modules/mailingListMailTransporter");
const { Product, Shipping_fee } = require('../models/models');
const production = process.env.NODE_ENV === "production";

router.get("/cart", (req, res) => {
    res.render('cart', { title: "Cart", pagename: "cart" })
});

router.get("/checkout", (req, res) => {
    if (!req.session.cart.length) return res.redirect(req.get("referrer"));
    res.render('checkout', { title: "Checkout", pagename: "checkout", countries })
});

router.post("/fx", (req, res) => {
    exchangeRates.symbols(req.body.currency).fetch().then(rate => {
        const symbol = curr_symbols[req.body.currency];
        req.session.fx_rate = rate;
        req.session.currency = req.body.currency.toLowerCase();
        req.session.currency_symbol = symbol;
        res.send({ rate, symbol });
    }).catch(err => res.status(500).send(err.message));
});

router.post("/cart/add", (req, res) => {
    Product.findById(req.body.id, (err, product) => {
        if (err) return res.status(500).send(err.message);
        if (!product || product.stock_qty < 1) return res.status(!product ? 404 : 400).send("Item currently not in stock");
        const { id, name, price, images, info, stock_qty } = product;
        const cartItemIndex = req.session.cart.findIndex(item => item.id === id);

        if (cartItemIndex >= 0) {
            const currentItem = req.session.cart[cartItemIndex];
            currentItem.qty += 1;
            if (currentItem.qty > stock_qty) currentItem.qty = stock_qty;
        } else {
            req.session.cart.unshift({ id, name, price, image: images[0], info, stock_qty, qty: 1 });
        }

        res.send(`${req.session.cart.length}`);
    })
});

router.post("/cart/remove", (req, res) => {
    const cartItemIndex = req.session.cart.findIndex(item => item.id === req.body.id);
    if (cartItemIndex === -1) return res.status(400).send("Item not found, or the cart is empty");
    req.session.cart.splice(cartItemIndex, 1);
    res.send(`${req.session.cart.length}`);
});

router.post("/cart/increment", (req, res) => {
    const { id, increment } = req.body;
    const cartItemIndex = req.session.cart.findIndex(item => item.id === id);
    const currentItem = req.session.cart[cartItemIndex];
    if (!currentItem) return res.status(400).send("Item not found, or the cart is empty");
    const newQuantity = currentItem.qty + parseInt(increment);
    const ltMin = newQuantity < 1;
    const gtMax = newQuantity > currentItem.stock_qty;
    currentItem.qty = ltMin ? 1 : gtMax ? currentItem.stock_qty : newQuantity;
    res.send(`${currentItem.qty}`);
});

router.post("/checkout/payment-intent/create", (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, postcode, shipping_fee_id, cart } = Object.assign(req.body, req.session);
    Shipping_fee.findById(shipping_fee_id, (err, fee) => {
        if (err || !fee) return res.send(err ? err.message : "Invalid shipping fee chosen");
        stripe.paymentIntents.create({ // Create a PaymentIntent with the order details
            receipt_email: email,
            description: cart.map(p => `${p.name} (£${parseFloat(p.price / 100).toFixed(2)} X ${p.qty})`).join(", \r\n") + `\r\n${fee.name}: ${fee.fee}`,
            amount: cart.map(p => ({ price: p.price, qty: p.qty })).reduce((sum, p) => sum + (p.price * p.qty), 0) + fee.fee,
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
    })
});

router.post("/checkout/payment-intent/complete", (req, res) => {
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
                transporter.setRecipient({ email: "cocohoneycosmetics@gmail.com" }).sendMail({
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
