const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const { Subscription_plan, Subscriber, Subscription_page } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');

router.post("/add", async (req, res) => {
    try {
        const { interval, interval_count, price, info } = req.body;
        const existing = await Subscription_plan.findOne({ interval, interval_count });
        const sub = new Subscription_plan({ interval, interval_count, price, info });
        if (existing) return res.status(400).send("Subscription plan already exists");
        await sub.save(); res.send("Subscription plan saved");
    } catch(err) { res.status(500).send(err.message) }
});

router.post("/edit", async (req, res) => {
    try {
        const { id, interval, interval_count, price, info } = req.body;
        const sub = await Subscription_plan.findById(id);
        if (!sub) return res.status(404).send("Subscription plan not found");
        if (interval) sub.interval = interval;
        if (interval_count) sub.interval_count = interval_count;
        if (price) sub.price = price;
        if (info) sub.info = info;
        await sub.save(); res.send("Subscription plan details updated");
    } catch(err) { res.status(500).send(err.message) }
});

router.post("/remove", (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Subscription_plan.deleteMany({_id : { $in: ids }}, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Subscription plan"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.post("/cancel", async (req, res) => {
    const { sub_id } = req.body;
    const transporter = new MailTransporter({ req, res });
    try {
        const subscription_del = await Stripe.subscriptions.del(sub_id);
        if (!subscription_del) throw { statusCode: 404, message: "No subscription found" }
        const product = await Stripe.products.retrieve(subscription_del.items.data[0].price.product);
        const invoice = await Stripe.invoices.retrieve(subscription_del.latest_invoice);
        const subscriber_doc = await Subscriber.findOneAndDelete({ sub_id: subscription_del.id });

        transporter.setRecipient(subscriber_doc.customer).sendMail({
            subject: "Subscription Cancelled - Cocohoney Cosmetics",
            message: `Hi ${subscriber_doc.customer.name},\n\n` +
            `This email is to confirm that your ${product.name} plan has been successfully cancelled.\n\n` +
            `((Click here to view your latest invoice))[${invoice.hosted_invoice_url}]\n` +
            `<small>(Copy the URL if the above link is not working - ${invoice.hosted_invoice_url})</small>\n\n` +
            "Any future pending direct debit payments will no longer be collected. " +
            "Thank you for your custom.\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) { console.error(err); throw err }
            res.send("Subscription cancelled");
        });
    } catch (err) { res.status(err.statusCode || 500).send(err.message || err) }
});

router.post("/page/info", async (req, res) => {
    const page = (await Subscription_page.find())[0] || new Subscription_page();
    page.info = req.body.info;
    page.save(() => res.send("Page summary info updated"));
});

module.exports = router;
