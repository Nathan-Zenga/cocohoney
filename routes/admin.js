const router = require('express').Router();
const crypto = require('crypto');
const passport = require('passport');
const { each, forEachOf } = require('async');
const Collections = require('../modules/Collections');
const isAuthed = require('../modules/auth-check-admin');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Admin, Discount_code, FAQ, Member, Ambassador, Order, Product, Sale } = require('../models/models');
require('../config/passport-admin')(passport);

router.get('/', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/admin/login");
    Collections(db => res.render('admin', { title: "Admin", pagename: "admin", ...db }))
});

router.get('/login', (req, res) => {
    res.render('admin-login', { title: "Admin Login", pagename: "admin" })
});

router.get('/logout', (req, res) => { req.logout(); res.redirect("/") });

router.get('/mail/form', isAuthed, async (req, res) => {
    const members = await Member.find().sort({ firstname: 1 }).exec();
    const ambassadors = await Ambassador.find().sort({ firstname: 1 }).exec();
    res.render('admin-mail-form', {
        title: "Admin - Compose Mail",
        pagename: "admin-mail-form",
        members: [...ambassadors, ...members],
        ambassadors
    })
});

router.get('/ambassador/account', isAuthed, async (req, res, next) => {
    var { firstname, lastname } = req.query;
    firstname = new RegExp(`^${firstname}$`, "i");
    lastname = new RegExp(`^${lastname}$`, "i");
    const ambassador = await Ambassador.findOne({ firstname, lastname });
    if (!ambassador) return next();
    const discount_code = await Discount_code.findOne({ code: ambassador.discount_code });
    const { orders_applied } = discount_code || {};
    const orders = await Order.find({ _id: { $in: orders_applied || [] } });
    const products = await Product.find();
    const docs = { ambassador, discount_code, orders, products };
    const opts = { title: "My Account | Ambassador", pagename: "account", ...docs };
    res.render('ambassador-account', opts);
});

router.post('/login', (req, res) => {
    const email = req.session.admin_email;
    req.body.email = email; Object.freeze(req.body);
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
                                `${res.locals.location_origin}/admin/activate?token=${doc.password}\n\n`
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

router.get("/activate", async (req, res) => {
    const { token } = req.query;
    Ambassador.findOne({ password: token, token_expiry_date: { $gte: Date.now() } }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return next();
        res.render('ambassador-activate', {
            title: "Ambassador Account Activation",
            pagename: "ambassador-activate",
            id: amb.id
        })
    });
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
        const docs = [];
        docs.push(...db.members);
        docs.push(...db.ambassadors);
        docs.push(...db.banner_slides);
        docs.push(...db.discount_codes);
        docs.push(...db.products);
        docs.push(...db.faqs);
        docs.push(...db.shipping_methods);
        docs.push(...db.boxes);
        docs.push(...db.overview_images);
        docs.push(...db.lookbook_media);
        res.send(docs);
    })
});

router.post('/discount_code/add', isAuthed, (req, res) => {
    const { code, percentage, max_use_limit, expiry_date } = req.body;
    new Discount_code({ code, percentage, max_use_limit, expiry_date }).save(err => {
        if (err) return res.status(500).send(err.message);
        res.send("Discount code added");
    })
});

router.post('/discount_code/edit', isAuthed, (req, res) => {
    const { id, code, percentage, max_use_limit, expiry_date } = req.body;
    Discount_code.findById(id, (err, discount_code) => {
        if (err || !code) return res.status(err ? 500 : 404).send(err ? err.message : "Discount code not found");
        if (code) discount_code.code = code;
        if (percentage) discount_code.percentage = percentage;
        if (max_use_limit) discount_code.max_use_limit = max_use_limit;
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

router.post('/mail/send', isAuthed, async (req, res) => {
    const { email, subject, message } = req.body;
    const member = await Member.findOne({ email });
    const ambassador = await Ambassador.findOne({ email });
    const transporter = new MailingListMailTransporter({ req, res });

    if (!member && !ambassador) return res.status(404).send("Recipient not found or specified");
    transporter.setRecipient(member || ambassador);
    transporter.sendMail({ subject, message }, err => {
        if (err) return res.status(500).send(err.message);
        res.send(`Email sent`);
    });
});

router.post('/mail/send/all', isAuthed, async (req, res) => {
    const { subject, message } = req.body;
    const members = await Member.find();
    const ambassadors = await Ambassador.find();
    const everyone = [...members, ...ambassadors];
    const transporter = new MailingListMailTransporter({ req, res });

    if (!everyone.length) return res.status(404).send("No recipients to send this email to");
    each(everyone, (recipient, cb) => {
        transporter.setRecipient(recipient);
        transporter.sendMail({ subject, message }, err => err ? cb(err.message) : cb());
    }, err => {
        if (err) return res.status(500).send(err.message);
        res.send(`Email${everyone.length > 1 ? "s" : ""} sent`);
    })
});

router.post('/mail/send/ambassadors', isAuthed, async (req, res) => {
    const { subject, message } = req.body;
    const ambassadors = await Ambassador.find();
    const transporter = new MailingListMailTransporter({ req, res });

    if (!ambassadors.length) return res.status(404).send("No ambassadors to send this email to");
    each(ambassadors, (recipient, cb) => {
        transporter.setRecipient(recipient);
        transporter.sendMail({ subject, message }, err => err ? cb(err.message) : cb());
    }, err => {
        if (err) return res.status(500).send(err.message);
        res.send(`Email${ambassadors.length > 1 ? "s" : ""} sent`);
    })
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

router.post('/sale/toggle', isAuthed, async (req, res) => {
    const { sale_on, sitewide, id, percentage } = req.body;
    const docs = await Sale.find();
    const sale = docs.length ? docs[0] : new Sale();

    sale.active = false;
    sale.sitewide = false;
    sale.percentage = undefined;
    Product.updateMany({}, { $set: { price_sale: undefined } }, err => {
        if (err) return res.status(500).send(err.message);
        if (!sale_on) return sale.save(err => res.send("Sale period now turned off"));

        sale.active = true;
        Product.find((err, products) => {
            if (sitewide) {
                sale.sitewide = true;
                sale.percentage = percentage;
                each(products, (product, cb) => {
                    const sale_discount = (percentage / 100) * product.price;
                    product.price_sale = ((product.price - sale_discount) / 100).toFixed(2);
                    product.save(err => cb());
                }, err => sale.save(err => res.send("Sale period now started site wide")));

            } else {
                const ids = (Array.isArray(id) ? id : [id]).filter(e => e);
                const percentages = (Array.isArray(percentage) ? percentage : [percentage]).filter(e => e);
                if (ids.length !== percentages.length) return res.status(400).send("Uneven number of selected items and specified percentages");
                forEachOf(ids, (product_id, i, cb) => {
                    const product = products.find(p => p.id == product_id);
                    const percent = parseInt(percentages[i]);
                    if (!product) return cb();
                    const sale_discount = (percent / 100) * (product.price / 100);
                    product.price_sale = ((product.price - sale_discount) / 100).toFixed(2);
                    product.save(err => err ? cb(err.message) : cb());
                }, err => {
                    if (err) return res.status(500).send(err.message);
                    sale.save(err => res.send("Sale period now started for the selected products"));
                })
            }
        })
    })
});

module.exports = router;
