const router = require('express').Router();
const crypto = require('crypto');
const passport = require('passport');
const Collections = require('../modules/Collections');
const isAuthed = require('../modules/authCheck');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Admin } = require('../models/models');
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
        const { members, products } = db;
        res.send([...members, ...products]);
    })
});

module.exports = router;
