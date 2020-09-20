const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Product, Shipping_method, Discount_code, Order } = require('../models/models');
const production = process.env.NODE_ENV === "production";

router.get("/", (req, res) => {
    if (!req.session.cart.length) return res.redirect(req.get("referrer"));
    Shipping_method.find().sort({ fee: 1 }).exec((err, shipping_methods) => {
        res.render('checkout', { title: "Checkout", pagename: "checkout", countries, shipping_methods })
    })
});

router.post("/payment-intent/create", async (req, res) => {
    const { firstname, lastname, email, address_l1, address_l2, city, postcode, discount_code, shipping_method_id } = req.body;
    const { cart, sale } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({
        price: sale ? p.price_sale : p.price,
        quantity: p.qty
    })).reduce((sum, p) => sum + (p.price * p.quantity), 0);
    var description = cart.map(p => `${p.name} (£${parseFloat(p.price / 100).toFixed(2)} X ${p.qty})`).join(", \r\n");

    try {
        var code = await Discount_code.findOne({ code: discount_code, expiry_date: { $gte: Date.now() } });
        var shipping_method = price_total >= 4000 ? { name: "Free Delivery", fee: 0 } : await Shipping_method.findById(shipping_method_id);
        if (!code && discount_code) { res.status(404); throw Error("Discount code invalid or expired") };
        if (!shipping_method) { res.status(404); throw Error("Invalid shipping fee chosen") };
    } catch (err) {
        if (res.statusCode !== 404) res.status(500);
        return res.send(err.message);
    };

    const discount_rate = code ? (code.percentage / 100) * price_total : 0;
    description += `\r\nShipping (${shipping_method.name}): £${(shipping_method.fee / 100).toFixed(2)}`
    description += discount_rate > 0 ? `\r\nDiscount: -£${(discount_rate / 100).toFixed(2)}` : "";

    Stripe.paymentIntents.create({
        receipt_email: email,
        description,
        amount: (price_total - discount_rate) + shipping_method.fee,
        currency: "gbp",
        shipping: {
            name: firstname + " " + lastname,
            address: { line1: address_l1, line2: address_l2, city, postal_code: postcode }
        }
    }).then(pi => {
        req.session.paymentIntentID = pi.id;
        req.session.current_discount_code = code;
        res.send({ clientSecret: pi.client_secret, pk: process.env.STRIPE_PK });
    }).catch(err => res.status(400).send(err.message));
});

router.post("/payment-intent/complete", async (req, res) => {
    const { paymentIntentID, cart, current_discount_code, admin_email } = req.session;
    const success_message = "<h1>Payment Successful</h1><p>A reciept has been forwarded to your email address.</p><p>Thank you for your purchase!</p>";
    const products = await Product.find();
    const code = current_discount_code ? await Discount_code.findById(current_discount_code.id) : null;

    Stripe.paymentIntents.retrieve(paymentIntentID).then(pi => {
        if (!pi) return res.status(400).send("Error occurred");
        if (pi.status !== "succeeded") return res.status(500).send(pi.status.replace(/_/g, " "));
        if (production) cart.forEach(item => {
            const product = products.filter(p => p.id === item.id)[0];
            if (product) {
                product.stock_qty -= item.qty;
                if (product.stock_qty < 0) product.stock_qty = 0;
                product.save();
            }
        });

        new Order({ basket: cart, discount_code: current_discount_code || undefined }).save();

        req.session.cart = [];
        req.session.paymentIntentID = undefined;
        if (code) {
            if (production) { code.used = true; code.used_count += 1; code.save() }
            req.session.current_discount_code = undefined;
        }

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
            transporter.setRecipient({ email: admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer. Summary shown below\n\n" +
                    `- Name: ${pi.shipping.name}\n- Email: ${pi.receipt_email}\n- Purchased items: ${pi.charges.data[0].description}\n` +
                    `- Address:\n\t${ (line1 + "\n\t" + line2).trim() }\n\t${city},\n\t${postal_code}\n` +
                    `- Date of purchase: ${Date(pi.created * 1000)}\n` +
                    `- Total amount: £${pi.amount / 100}-\n\n` +
                    `A copy of their receipt:\n${pi.charges.data[0].receipt_url}`
            }, err2 => {
                const error = err || err2;
                if (error) return res.status(500).send(error.message || (err || "")+" / "+(err2 || ""));
                res.send(success_message);
            });
        });
    }).catch(err => res.status(500).send("Error occurred"))
});

module.exports = router;
