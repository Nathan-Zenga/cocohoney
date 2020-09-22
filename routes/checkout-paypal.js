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
    const { discount_code, shipping_method_id } = req.body;
    const { cart, location_origin } = Object.assign(req.session, res.locals);
    const price_total = cart.map(p => ({
        price: (req.user || {}).is_ambassador ? p.price_amb : p.price,
        quantity: p.qty
    })).reduce((sum, p) => sum + (p.price * p.quantity), 0);

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
                    name: item.name + ( item.deal ? " (" + item.items.map(e => `${e.qty} x ${e.name}`).join(",") + ")": "" ),
                    price: (item.price / 100).toFixed(2),
                    quantity: item.qty,
                    currency: "GBP"
                }))
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
        req.session.current_discount_code = code;
        req.session.transaction = payment.transactions[0];
        res.send(payment.links.find(link => link.rel === "approval_url").href);
    });
});

router.get("/complete", async (req, res) => {
    const { paymentId, PayerID } = req.query;
    const { cart, current_discount_code, transaction } = req.session;
    const products = await Product.find();
    const code = current_discount_code ? await Discount_code.findById(current_discount_code.id) : null;

    paypal.payment.execute(paymentId, {
        payer_id: PayerID,
        transactions: [{ amount: transaction.amount }]
    }, (err, payment) => {
        if (err) return res.status(err.httpStatusCode).render('checkout-error', {
            title: "Payment Error",
            pagename: "checkout-error",
            error: `${err.message}\n${(err.response.details || []).map(d => d.issue).join(",\n") || err.response.message}`
        });

        const { recipient_name, line1, line2, city, postal_code } = payment.transactions[0].item_list.shipping_address;
        const { email } = payment.payer.payer_info;
        const purchase_summary = payment.transactions[0].item_list.items.map(item => `${item.name} X ${item.quantity} - ${item.price}`).join("\n");

        if (production) cart.forEach(item => {
            const product = products.filter(p => p.id === item.id)[0];
            if (product) {
                product.stock_qty -= item.qty;
                if (product.stock_qty < 0) product.stock_qty = 0;
                product.save();
            }
        });

        new Order({
            basket: cart,
            discount_code: current_discount_code || undefined,
            customer: { name: recipient_name, email }
        }).save();

        req.session.cart = [];
        req.session.transaction = undefined;
        if (code) {
            if (production) { code.used = true; code.used_count += 1; code.save() }
            req.session.current_discount_code = undefined;
        }

        if (!production) return res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" });

        const transporter = new MailingListMailTransporter({ req, res });
        transporter.setRecipient({ email }).sendMail({
            subject: "Payment Successful - Cocohoney Cosmetics",
            message: `Hi ${recipient_name},\n\n` +
                `Your payment was successful. Below is a summary of your purchase:\n\n${purchase_summary}\n\n` +
                "If you have not yet received your PayPal receipt via email, do not hesistate to contact us.\n\n" +
                "Thank you for shopping with us!\n\n- Cocohoney Cosmetics"
        }, err => {
            transporter.setRecipient({ email: req.session.admin_email }).sendMail({
                subject: "Purchase Report: You Got Paid!",
                message: "You've received a new purchase from a new customer. Summary shown below\n\n" +
                    `- Name: ${recipient_name}\n- Email: ${email}\n` +
                    `- Purchased items: ${purchase_summary}\n` +
                    `- Address:\n\t${ (line1 + "\n\t" + line2).trim() }\n\t${city},\n\t${postal_code}\n` +
                    `- Date of purchase: ${Date(payment.create_time)}\n` +
                    `- Total amount: £${payment.transactions[0].amount.total}\n\n` +
                    `Full details of this transaction can be found on your Paypal account`
            }, err2 => {
                if (err) console.error(err || err2), res.status(500);
                res.render('checkout-success', { title: "Payment Successful", pagename: "checkout-success" })
            });
        });
    });
});

module.exports = router;
