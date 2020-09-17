const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { FAQ } = require('../models/models');

router.get('/', (req, res) => {
    res.render('index', { title: null, pagename: "home" })
});

router.get('/about', (req, res) => {
    res.render('about', { title: "About", pagename: "about" })
});

router.get('/shipping', (req, res) => {
    res.render('shipping', { title: "Shipping Information", pagename: "shipping-info" })
});

router.get('/contact', (req, res) => {
    res.render('contact', { title: "Contact Us", pagename: "contact" })
});

router.get('/account/login', (req, res) => {
    res.render('customer-login', { title: "Customer Log In", pagename: "customer-login" })
});

router.get('/faq', (req, res) => {
    FAQ.find((err, faqs) => res.render('faq', { title: "FAQs", pagename: "faq", faqs }))
});

router.post('/contact/mail/send', (req, res) => {
    const { firstname, lastname, email, message } = req.body;
    const transporter = new MailingListMailTransporter({ req, res }, { email: req.session.admin_email });
    const mail = { subject: "New message / enquiry", message: `New message from ${firstname} ${lastname} (${email}):\n\n${message}` };
    transporter.sendMail(mail, err => res.status(err ? 500 : 200).send(err ? err.message : "Email sent"));
});

module.exports = router;
