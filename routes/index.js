const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { FAQ, Review } = require('../models/models');
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

router.get('/', (req, res) => {
    Review.find({ rating: { $gt: 3 } }).sort({ created_at: -1 }).exec((err, reviews) => {
        res.render('index', { title: null, pagename: "home", reviews: chunk(reviews, 2).slice(0, 2) })
    })
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

router.post('/contact/mail/send', (req, res) => {
    const { firstname, lastname, email, message } = req.body;
    const transporter = new MailingListMailTransporter({ req, res }, { email: req.session.admin_email });
    const mail = { subject: "New message / enquiry", message: `New message from ${firstname} ${lastname} (${email}):\n\n${message}` };
    transporter.sendMail(mail, err => res.status(err ? 500 : 200).send(err ? err.message : "Email sent"));
});

module.exports = router;
