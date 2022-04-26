const router = require('express').Router();
const isAuthed = require('../modules/auth-check-admin');
const MailTransporter = require('../modules/mail-transporter');
const { Shipping_method, Order, Shipping_page } = require('../models/models');

router.get('/', async (req, res) => {
    const info = (await Shipping_page.find())[0]?.info || "";
    res.render('shipping', { title: "Shipping Information", pagename: "shipping-info", info })
});

router.post('/new', isAuthed, (req, res) => {
    const { name, fee, info } = req.body;
    Shipping_method.create({ name, fee, info }, err => res.send("Shipping method saved"));
});

router.post('/edit', isAuthed, (req, res) => {
    const { id, name, fee, info } = req.body;
    Shipping_method.findById(id, (err, method) => {
        if (err) return res.status(500).send(err.message);
        if (name) method.name = name;
        if (fee) method.fee = fee;
        if (info) method.info = info;
        method.save(err => res.send("Shipping method updated"));
    });
});

router.post('/page/edit', isAuthed, async (req, res) => {
    const { info } = req.body;
    const docs = await Shipping_page.find();
    const info_page = docs.length ? docs[0] : new Shipping_page();
    info_page.info = info;
    info_page.save(err => res.send("Shipping & delivery page updated"));
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Shipping_method.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err.message || "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Shipping method(s) not found");
        res.send("Shipping method"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.get("/tracking/ref/send", async (req, res, next) => {
    const { id } = req.query;
    if (!id) return next();
    const pagename = "tracking-ref-form";
    const order = await Order.findById(Array.isArray(id) ? id[0] : id).catch(e => e);
    const opts = { title: "Submit Tracking Reference", pagename, error: null };
    if (!order) return res.status(404).render(pagename, { ...opts, error: "Cannot find order" });
    if (order instanceof Error) return res.status(400).render(pagename, { ...opts, error: "Invalid URL query" });
    if (order.tracking_ref) return res.status(400).render(pagename, { ...opts, error: "A tracking number has already been provided for this order" });
    res.render(pagename, { ...opts, order })
});

router.post("/tracking/ref/send", async (req, res) => {
    const { id, tracking_ref } = req.body;
    if (!tracking_ref?.trim()) return res.status(400).send("Missing tracking reference number");
    try {
        const order = await Order.findById(Array.isArray(id) ? id[0] : id);
        if (!order) return res.status(404).send("Cannot find order");
        if (order.tracking_ref) return res.status(400).send("A tracking number has already been provided for this order");

        order.tracking_ref = tracking_ref;
        const { customer_name, customer_email } = await order.save();
        const transporter = new MailTransporter({ email: customer_email });
        const subject = `Your tracking number - ${tracking_ref}`;
        const message = `Hi ${customer_name},\n\n` +
        "Following your recent order, we can confirm your tracking number shown below:\n\n" +
        `<b><u>${tracking_ref}</u></b>\n\n` +
        "You can use this to track your order via Royal Mail (https://www3.royalmail.com/track-your-item#/). " +
        "Again, thank you for shopping with us at Cocohoney Cosmetics!";

        await transporter.sendMail({ subject, message });
        res.send(`Tracking number sent to ${order.customer_name} via email`);
    } catch(err) { res.status(500).send(err.message) }
});

module.exports = router;
