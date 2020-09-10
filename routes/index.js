const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const { Discount_code, Banner_slide } = require('../models/models');

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

router.get('/discount_code/add', (req, res) => {
    const { code, expiry_date } = req.body;
    new Discount_code({ code, expiry_date }).save(err => {
        if (err) return res.status(500).send(err.message);
        res.send("Discount code added");
    })
});

router.get('/discount_code/edit', (req, res) => {
    const { id, code, expiry_date } = req.body;
    Discount_code.findById(id, (err, discount_code) => {
        if (err || !code) return res.status(err ? 500 : 404).send(err ? err.message : "Discount code not found");
        if (code) discount_code.code = code;
        if (expiry_date) discount_code.expiry_date = expiry_date;
    });
});

router.get('/discount_code/remove', (req, res) => {
    var ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Banner_slide.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Banner slide(s) not found");
        res.send("Banner slide"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
