const router = require('express').Router();
const crypto = require('crypto');
const passport = require('passport');
const Collections = require('../modules/Collections');
const isAuthed = require('../modules/authCheck');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Admin, Discount_code, FAQ } = require('../models/models');
require('../config/passport')(passport);

router.get('/', isAuthed, (req, res) => {
    Collections(db => res.render('admin', { title: "Admin", pagename: "admin", ...db }))
});

// router.get('/login', (req, res) => {
//     res.render('admin-login', { title: "Admin Login", pagename: "admin" })
// });

// router.get('/activate/:token', (req, res, next) => {
//     Admin.findOne({ password: req.params.token, token_expiry_date: { $gte: Date.now() } }, (err, found) => {
//         if (!found) return next();
//         res.render('admin-activate', { title: "Admin Register", pagename: "admin", token: found.password })
//     })
// });

router.get('/logout', (req, res) => { req.logout(); res.redirect("/") });

router.get('/mail/form', isAuthed, (req, res) => {
    res.render('admin-mail-form', { title: "Admin - Compose Mail", pagename: "admin-mail-form" })
});

router.post('/login', (req, res) => {
    const email = req.session.admin_email;
    req.body.username = email; Object.freeze(req.body);
    passport.authenticate("local-login-admin", (err, user, info) => {
        if (err) return res.status(500).send(err.message || err);
        if (!user) return res.status(400).send(info.message);
        if (user === "to_activate") {
            Admin.deleteMany({ email: "temp" }, err => {
                crypto.randomBytes(20, (err, buf) => {
                    let password = buf.toString("hex");
                    let token_expiry_date = new Date(Date.now() + (1000 * 60 * 60 * 2));
                    new Admin({ email: "temp", password, token_expiry_date }).save((err, doc) => {
                        new MailingListMailTransporter({ req, res }, { email }).sendMail({
                            subject: "Admin Account Activation",
                            message: "You're recieving this email because an admin account needs setting up. " +
                                "Please click the link below to activate the account, as this will only be " +
                                "<u>available for the next 2 hours</u> from the time of this email received:\n\n" +
                                `${res.locals.location_origin}/admin/activate/${doc.password}\n\n`
                        }, err => {
                            if (err) return res.status(500).send(err.message || err);
                            res.status(400).send(info.message);
                        });
                    })
                })
            });
        } else {
            req.logIn(user, err => {
                res.status(err ? 500 : 200).send(err ? err.message || err : "/admin")
            });
        }
    })(req, res);
});

router.post("/activate/:token", async (req, res) => {
    req.body.username = req.session.admin_email; Object.freeze(req.body);
    passport.authenticate("local-register-admin", (err, user, info) => {
        if (err) return res.status(500).send(err.message || err);
        if (!user) return res.status(400).send(info.message);
        req.logIn(user, err => {
            if (err) return res.status(500).send(err.message || err);
            Admin.deleteMany({ email: "temp" }, err => {
                res.status(err ? 500 : 200).send(err ? err.message : "/admin")
            });
        });
    })(req, res);
});

router.post("/search", isAuthed, (req, res) => {
    Collections(db => {
        const { members, banner_slides, discount_codes, products, faqs, shipping_methods, boxes } = db;
        res.send([...members, ...banner_slides, ...discount_codes, ...products, ...faqs, ...shipping_methods, ...boxes]);
    })
});

router.post('/discount_code/add', isAuthed, (req, res) => {
    const { code, percentage, expiry_date } = req.body;
    new Discount_code({ code, percentage, expiry_date }).save(err => {
        if (err) return res.status(500).send(err.message);
        res.send("Discount code added");
    })
});

router.post('/discount_code/edit', isAuthed, (req, res) => {
    const { id, code, percentage, expiry_date } = req.body;
    Discount_code.findById(id, (err, discount_code) => {
        if (err || !code) return res.status(err ? 500 : 404).send(err ? err.message : "Discount code not found");
        if (code) discount_code.code = code;
        if (percentage) discount_code.percentage = percentage;
        if (expiry_date) discount_code.expiry_date = expiry_date;
        discount_code.save(err => {
            if (err) return res.status(500).send(err.message);
            res.send("Discount code details saved");
        })
    });
});

router.post('/discount_code/remove', isAuthed, (req, res) => {
    var ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Discount_code.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Discount code(s) not found");
        res.send("Discount code"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.post('/mail/send', isAuthed, (req, res) => {
    const { email, subject, message } = req.body;
    new MailingListMailTransporter({ req, res }, { email }).sendMail({
        subject, message
    }, err => res.status(err ? 500 : 200).send(err ? err.message : "Email sent"));
});

router.post('/faqs/add', isAuthed, (req, res) => {
    const { question, answer } = req.body;
    new FAQ({ question, answer }).save(err => res.send("FAQ saved"));
});

router.post('/faqs/edit', isAuthed, (req, res) => {
    const { id, question, answer } = req.body;
    FAQ.findById(id, (err, faq) => {
        if (err) return res.status(500).send(err.message);
        if (question) faq.question = question;
        if (answer) faq.answer = answer;
        faq.save(err => res.send("FAQ updated"));
    });
});

router.post('/faqs/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    FAQ.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("FAQ(s) not found");
        res.send("FAQ"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
