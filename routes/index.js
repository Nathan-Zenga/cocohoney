const router = require('express').Router();
const MailTransporter = require('../modules/mail-transporter');
const { FAQ, Review, Overview_image, Order, Shipping_method, Discount_code, Highlights_post, Ambassador, Member, Subscriber } = require('../models/models');
const recaptcha = require('../modules/recaptcha');
const { RECAPTCHA_SITE_KEY, CHC_EMAIL } = process.env;

router.get('/', async (req, res) => {
    const overview_images = await Overview_image.find().sort({ position: 1 }).exec();
    const reviews = await Review.find({ rating: { $gt: 3 } }).sort({ created_at: -1 }).exec();
    const highlights = await Highlights_post.find().sort({ _id: -1 }).exec();
    res.render('index', { title: null, pagename: "home", overview_images, reviews, highlights })
});

router.get('/contact', (req, res) => {
    res.render('contact', { title: "Contact Us", pagename: "contact", recaptcha_site_key: RECAPTCHA_SITE_KEY })
});

router.get('/faq', (req, res) => {
    FAQ.find((err, faqs) => res.render('faq', { title: "FAQs", pagename: "faq", faqs }))
});

router.get('/order/:id', async (req, res, next) => {
    const order = await Order.findById(req.params.id).catch(e => null);
    if (!order) return next();
    const shipping_method = await Shipping_method.findOne({ name: order.shipping_method });
    const dc_used = await Discount_code.findOne({ orders_applied: { $all: [order.id] } });
    res.render('orders', { title: "Order " + order.id, pagename: "orders", order, shipping_method, dc_used })
});

router.get('/mail/unsubscribe', async (req, res) => {
    const { email } = req.query;
    const a = await Ambassador.findOne({ email });
    const m = await Member.findOne({ email });
    const c = await Order.findOne({ customer_email: email });
    const s = await Subscriber.findOne({ "customer.email": email });
    const r = a || m || c || s;
    if (!email || !r) return res.status(400).render('error', { html: `<h1>UNABLE TO UNSUBSCRIBE</h1><p>The given email ${email ? `(${email}) ` : ""}is invalid or isn't registered on our site</p>` });
    r.mail_sub = false;
    const saved = await r.save();
    res.render('mail-unsubscribe-msg', { email: saved.email || saved.customer_email });
});

router.post('/contact/mail/send', recaptcha, async (req, res) => {
    const { firstname, lastname, email, message } = req.body;
    const subject = "New message / enquiry";
    const msg = `New message from <b>${firstname} ${lastname} (${email})</b>:\n\n${message}`;
    new MailTransporter({ email: CHC_EMAIL }).sendMail({ subject, message: msg }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Email sent");
    });
});

module.exports = router;
