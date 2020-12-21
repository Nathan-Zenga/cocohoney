const router = require('express').Router();
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const countries = require("../modules/country-list");
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { Subscription_plan, Subscriber, Subscription_page } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');

router.get("/:id", async (req, res, next) => {
    const subscriber = await Subscriber.findOne({ sub_id: req.params.id });
    if (!subscriber) return next();
    const sub = await Stripe.subscriptions.retrieve(subscriber.sub_id, { expand: ["customer", "latest_invoice", "default_payment_method"] });
    const subscriptions = [sub];
    const subscription_products = await Stripe.products.list({ ids: subscriptions.map(s => s.items.data[0].price.product) });
    res.render('subscriber-account', { title: "My Subscription Account", pagename: "account", countries, orders: null, wishlist: null, subscriptions, subscription_products });
});

router.post("/add", isAuthed, async (req, res) => {
    try {
        const { interval, interval_count, price, info, image_file, image_url } = req.body;
        const existing = await Subscription_plan.findOne({ interval, interval_count });
        const sub = new Subscription_plan({ interval, interval_count, price, info });
        if (existing) return res.status(400).send("Subscription plan already exists");
        if (!image_url && !image_file) { await sub.save(); return res.send("Subscription plan saved") }
        const public_id = ("cocohoney/subscription-plan/" + sub.name).replace(/[ ?&#\\%<>]/g, "_");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id });
        sub.image = { p_id: result.public_id, url: result.secure_url };
        await sub.save(); res.send("Subscription plan saved");
    } catch(err) { res.status(err.http_code || 500).send(err.message) }
});

router.post("/edit", isAuthed, async (req, res) => {
    try {
        const { id, interval, interval_count, price, info, image_url, image_file } = req.body;
        const existing = await Subscription_plan.findOne({ interval, interval_count });
        const sub = await Subscription_plan.findById(id);
        if (existing) return res.status(400).send("Subscription plan already exists");
        if (!sub) return res.status(404).send("Subscription plan not found");
        if (interval) sub.interval = interval;
        if (interval_count) sub.interval_count = interval_count;
        if (price) sub.price = price;
        if (info) sub.info = info;
        if (!image_url && !image_file) { await sub.save(); return res.send("Subscription plan details updated") }
        await cloud.api.delete_resources([sub.image.p_id]);
        const public_id = ("cocohoney/subscription-plan/" + sub.name).replace(/[ ?&#\\%<>]/g, "_");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id });
        sub.image = { p_id: result.public_id, url: result.secure_url };
        await sub.save(); res.send("Subscription plan details updated");
    } catch(err) { res.status(err.http_code || 500).send(err.message) }
});

router.post("/remove", isAuthed, async (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    try {
        const plans = await Subscription_plan.find({_id : { $in: ids }});
        await cloud.api.delete_resources(plans.map(p => p.image.p_id));
        await Subscription_plan.deleteMany({_id : { $in: plans.map(p => p.id) }});
        res.send("Subscription plan"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    } catch(err) { res.status(err.http_code || 500).send(err.message) }
});

router.post("/cancel", async (req, res) => {
    try {
        const transporter = new MailTransporter({ req, res });
        const subscription = await Stripe.subscriptions.retrieve(req.body.sub_id);
        if (!subscription) throw { statusCode: 404, message: "No subscription found" }
        const product = await Stripe.products.retrieve(subscription.items.data[0].price.product);
        const invoice = await Stripe.invoices.retrieve(subscription.latest_invoice);
        const subscriber_doc = await Subscriber.findOneAndDelete({ sub_id: subscription.id });
        await Stripe.subscriptions.del(subscription.id);

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

router.post("/page/info", isAuthed, async (req, res) => {
    const page = (await Subscription_page.find())[0] || new Subscription_page();
    page.info = req.body.info;
    page.save(() => res.send("Page summary info updated"));
});

module.exports = router;
