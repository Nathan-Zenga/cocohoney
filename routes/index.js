const router = require('express').Router();
const isAuthed = require('../modules/authCheck');

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
    res.render('faq', { title: "FAQs", pagename: "faq" })
});

module.exports = router;
