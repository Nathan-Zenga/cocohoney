const router = require('express').Router();
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { FAQ, Review, Overview_image, Order, Shipping_method } = require('../models/models');

router.get('/', async (req, res) => {
    const overview_images = await Overview_image.find().sort({ position: 1 }).exec();
    const reviews = await Review.find({ rating: { $gt: 3 } }).sort({ created_at: -1 }).exec();
    res.render('index', { title: null, pagename: "home", overview_images, reviews })
});

router.get('/about', (req, res) => {
    res.render('about', { title: "About", pagename: "about" })
});

router.get('/contact', (req, res) => {
    res.render('contact', { title: "Contact Us", pagename: "contact" })
});

router.get('/faq', (req, res) => {
    FAQ.find((err, faqs) => res.render('faq', { title: "FAQs", pagename: "faq", faqs }))
});

router.get('/order/:id', async (req, res, next) => {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return next();
    const shipping_method = await Shipping_method.findOne({ name: order.shipping_method });
    res.render('orders', { title: "Order " + order.id, pagename: "orders", order, shipping_method })
});

router.post('/contact/mail/send', (req, res) => {
    const { firstname, lastname, email, message } = req.body;
    const transporter = new MailingListMailTransporter({ req, res }, { email: req.session.admin_email });
    const subject = "New message / enquiry";
    const msg = `New message from ${firstname} ${lastname} (${email}):\n\n${message}`;
    transporter.sendMail({ subject, message: msg }, err => {
        if (err) return res.status(500).send(err.message || err);
        res.send("Email sent");
    });
});

module.exports = router;
