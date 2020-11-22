const router = require('express').Router();
const isAuthed = require('../modules/auth-check-admin');
const MailTransporter = require('../modules/mail-transporter');
const { Shipping_method, Order, Shipping_page } = require('../models/models');

router.get('/', async (req, res) => {
    const info = (await Shipping_page.find())[0].info || "";
    res.render('shipping', { title: "Shipping Information", pagename: "shipping-info", info })
});

router.post('/new', isAuthed, (req, res) => {
    const { name, fee, info } = req.body;
    new Shipping_method({ name, fee, info }).save(err => res.send("Shipping method saved"));
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
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Shipping method(s) not found");
        res.send("Shipping method"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.get("/tracking/ref/send", (req, res, next) => {
    const { id } = req.query;
    if (!id) return next();
    Order.findById(Array.isArray(id) ? id[0] : id, (err, order) => {
        res.render('tracking-ref-form', {
            title: "Submit Tracking Reference",
            pagename: "tracking-ref-form",
            order,
            error: () => {
                if (err) return res.status(500), "Invalid URL query";
                if (!order) return res.status(404), "Cannot find order";
                if (order && order.tracking_ref) return res.status(400), "A tracking number has already been provided for this order";
                return "";
            }
        })
    })
});

router.post("/tracking/ref/send", (req, res) => {
    const { id, tracking_ref } = req.body;
    if (!tracking_ref) return res.status(400).send("Missing tracking reference number");
    Order.findById(Array.isArray(id) ? id[0] : id, (err, order) => {
        if (err) return res.status(500).send(err.message);
        if (!order) return res.status(404).send("Cannot find order");
        if (order && order.tracking_ref) return res.status(400).send("A tracking number has already been provided for this order");

        order.tracking_ref = tracking_ref;
        order.save((err, saved) => {
            if (err) return res.status(500).send(err.message);
            const { customer_name, customer_email, tracking_ref } = saved;
            const transporter = new MailTransporter({ req, res });

            transporter.setRecipient({ email: customer_email }).sendMail({
                subject: `Your tracking number - ${tracking_ref}`,
                message: `Hi ${customer_name},\n\n` +
                "Following your recent order, we can confirm your tracking number shown below:\n\n" +
                `<b><u>${tracking_ref}</u></b>\n\n` +
                "You can use this to track your order via Royal Mail (https://www3.royalmail.com/track-your-item#/). " +
                "Again, thank you for shopping with us at Cocohoney Cosmetics!"
            }, err => {
                if (err) return res.status(500).send(err.message || err);
                res.send(`Tracking number sent to ${order.customer_name} via email`);
            })
        })
    })
});

module.exports = router;
