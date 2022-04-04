const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Collections = require('../modules/Collections');
const isAuthed = require('../modules/auth-check-admin');
const MailTransporter = require('../modules/mail-transporter');
const sale_toggle = require('../modules/sale_toggle');
const { Admin, Discount_code, FAQ, Member, Ambassador, Order, Product, Wishlist } = require('../models/models');
const passport = require('../config/passport');

router.get('/', (req, res) => {
    if (!res.locals.is_admin) return res.redirect("/admin/login");
    Collections(db => res.render('admin', { title: "Admin", pagename: "admin", ...db }))
});

router.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/");
    res.render('admin-login', { title: "Admin Login", pagename: "admin" })
});

router.get('/logout', (req, res) => { req.logout(); res.redirect("/") });

router.get('/mail/form', async (req, res) => {
    if (!res.locals.is_admin) return res.redirect("/admin/login?redirect_to=" + req.originalUrl);
    const members = await Member.find().sort({ firstname: 1 }).exec();
    const ambassadors = await Ambassador.find().sort({ firstname: 1 }).exec();
    const orders = await Order.find().sort({ customer_email: 1 }).exec();
    const customers = orders.filter((o, i, a) => ![...ambassadors, ...members].find(m => m.email === o.customer_email) && o.customer_email !== a[i+1]?.customer_email).sort((a, b) => a.customer_name - b.customer_name);
    const title = "Admin - Compose Mail";
    const pagename = "admin-mail-form";
    const recipients = [...ambassadors.filter(a => !members.find(m => m.email === a.email)), ...members, ...customers];
    res.render('admin-mail-form', { title, pagename, recipients })
});

router.get('/ambassador/account', isAuthed, async (req, res, next) => {
    const { firstname: fn, lastname: ln } = req.query;
    const firstname = new RegExp(`^${fn}$`, "i");
    const lastname = new RegExp(`^${ln}$`, "i");
    const ambassador = await Ambassador.findOne({ firstname, lastname });
    if (!ambassador) return next();
    const discount_code = await Discount_code.findOne({ code: ambassador.discount_code });
    const { orders_applied } = discount_code || {};
    const orders = await Order.find({ _id: { $in: orders_applied || [] } }).sort({ created_at: -1 }).exec();
    const products = await Product.find();
    const wishlist = await Wishlist.findOne({ customer_id: ambassador.id });
    const wishlist_items = await Product.find({ _id: { $in: wishlist?.items || [] } });
    const docs = { ambassador, discount_code, orders, products, wishlist: wishlist_items };
    const opts = { title: "My Account | Ambassador", pagename: "account", ...docs };
    res.render('ambassador-account', opts);
});

router.post('/login', (req, res) => {
    const { redirect_to } = req.query;
    const email = process.env.CHC_EMAIL;
    req.body.email = email; Object.freeze(req.body);
    passport.authenticate("local-login-admin", async (err, user, info) => {
        if (err) return res.status(500).send(err.message);
        if (!user) return res.status(400).send(info.message);
        if (user === "to_activate") {
            await Admin.deleteMany({ email: "temp" });
            const password = crypto.randomBytes(20).toString("hex");
            const token_expiry_date = new Date(Date.now() + (1000 * 60 * 60 * 2));
            const doc = await Admin.create({ email: "temp", password, token_expiry_date });
            const subject = "Admin Account Activation";
            const message = "You're receiving this email because an admin account needs setting up. " +
                "Please click the link below to activate the account, as this will only be " +
                "<u>available for the next 2 hours</u> from the time of this email received:\n\n" +
                `${res.locals.location_origin}/admin/activate?token=${doc.password}\n\n`;
            new MailTransporter({ email }).sendMail({ subject, message }, err => {
                if (err) return res.status(500).send(err.message);
                res.status(400).send(info.message);
            });
        } else {
            req.login(user, err => {
                if (err) return res.status(500).send(err.message);
                res.locals.cart = req.session.cart = [];
                res.send(Array.isArray(redirect_to) ? redirect_to[0] : redirect_to || "/admin")
            });
        }
    })(req, res);
});

router.get("/activate", async (req, res, next) => {
    const { token } = req.query;
    const admin = await Admin.findOne({ password: token, token_expiry_date: { $gte: Date.now() } });
    if (!admin) return next();
    const title = "Admin Account Activation";
    const pagename = "admin-activate";
    res.render('admin-activate', { title, pagename, token });
});

router.post("/activate", async (req, res) => {
    try {
        const { token, password, password_confirm } = req.body;
        const admin = await Admin.findOne({ password: token });
        if (!admin) return res.status(400).send("Account not found");
        if (password !== password_confirm) return res.status(400).send("Passwords do not match");
        admin.email = process.env.CHC_EMAIL;
        admin.password = await bcrypt.hash(password, 10);
        admin.token_expiry_date = undefined;
        await admin.save();
        await Admin.deleteMany({ email: "temp" });
        res.send("Account made and you can now log in");
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/discount_code/add', isAuthed, (req, res) => {
    const { code, percentage, expiry_date } = req.body;
    Discount_code.create({ code, percentage, expiry_date }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Discount code added");
    })
});

router.post('/discount_code/edit', isAuthed, async (req, res) => {
    const { id, code, percentage, expiry_date } = req.body;
    try {
        const dc = await Discount_code.findById(id);
        if (!code) return res.status(404).send("Discount code not found");
        if (code) dc.code = code;
        if (percentage) dc.percentage = percentage;
        if (expiry_date) dc.expiry_date = expiry_date;
        await dc.save(); res.send("Discount code details saved");
    } catch (err) { res.status(500).send(err.message) }
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
    const { email, email2, subject, message } = req.body;
    const member = email ? await Member.findOne({ email }, { mail_sub: 0 }) : null;
    const ambassador = email ? await Ambassador.findOne({ email }, { mail_sub: 0 }) : null;
    const transporter = new MailTransporter();

    transporter.setRecipient(member || ambassador || { email: email || email2 });
    transporter.sendMail({ subject, message }, err => {
        if (err) return res.status(500).send(err.message);
        res.send(`Email sent`);
    });
});

router.post('/mail/send/all', isAuthed, async (req, res) => {
    const { subject, message } = req.body;
    const members = await Member.find({ mail_sub: true }).sort({ firstname: 1 }).exec();
    const ambassadors = await Ambassador.find({ mail_sub: true }).sort({ firstname: 1 }).exec();
    const orders = await Order.find({ mail_sub: true }).sort({ customer_email: 1 }).exec();
    const customers = orders.filter((o, i, a) => ![...ambassadors, ...members].find(m => m.email === o.customer_email) && o.customer_email !== a[i+1]?.customer_email).sort((a, b) => a.customer_name - b.customer_name);
    const everyone = [
        ...ambassadors.filter(a => !members.find(m => m.email === a.email)),
        ...members,
        ...customers.map(cus => ({ name: cus.customer_name, email: cus.customer_email, mail_sub: true })) ];

    if (!subject || !message) return res.status(400).send("Subject and message cannot be empty");
    if (!everyone.length) return res.status(404).send("No recipients to send this email to");
    for (let i = 0; i < everyone.length; i++) {
        setTimeout(() => {
            const recipient = everyone[i];
            const transporter = new MailTransporter();
            transporter.setRecipient(recipient);
            transporter.sendMail({ subject, message }, err => {
                if (err) return console.error(`${err.message}\nNot sent for ${recipient.name || recipient.firstname +" "+ recipient.lastname} onwards`);
                console.log("Email sent");
            });
        }, i * 2000);
    }
    res.send(`Email${everyone.length > 1 ? "s" : ""} sent`);
});

router.post('/mail/send/ambassadors', isAuthed, async (req, res) => {
    const { subject, message } = req.body;
    const ambassadors = await Ambassador.find().sort({ firstname: 1 }).exec();
    const transporter = new MailTransporter();

    if (!ambassadors.length) return res.status(404).send("No ambassadors to send this email to");
    transporter.setRecipients(ambassadors);
    transporter.sendMail({ subject, message }, err => {
        if (err) return res.status(500).send(err.message);
        res.send(`Email${ambassadors.length > 1 ? "s" : ""} sent`);
    });
});

router.post('/mail/sub-toggle', isAuthed, async (req, res) => {
    const { email } = req.body;
    const emails = Array.isArray(email) ? email : [email];
    const members = await Member.find().sort({ firstname: 1 }).exec();
    const ambassadors = (await Ambassador.find().sort({ firstname: 1 }).exec()).filter(a => !members.find(m => m.email === a.email));
    const orders = await Order.find().sort({ customer_email: 1 }).exec();
    const customers = orders.filter((o, i, a) => ![...ambassadors, ...members].find(m => m.email === o.customer_email) && o.customer_email !== a[i+1]?.customer_email);
    await Member.updateMany({ email: { $in: members.map(d => d.email) } }, { $set: { mail_sub: false } });
    await Member.updateMany({ email: { $in: emails } }, { $set: { mail_sub: true } });
    await Ambassador.updateMany({ email: { $in: ambassadors.map(d => d.email) } }, { $set: { mail_sub: false } });
    await Ambassador.updateMany({ email: { $in: emails } }, { $set: { mail_sub: true } });
    await Order.updateMany({ customer_email: { $in: customers.map(d => d.customer_email) } }, { $set: { mail_sub: false } });
    await Order.updateMany({ customer_email: { $in: emails } }, { $set: { mail_sub: true } });
    res.send("Updated!");
});

router.post('/faqs/add', isAuthed, (req, res) => {
    const { question, answer } = req.body;
    FAQ.create({ question, answer }, err => res.send("FAQ saved"));
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
    const { status, response } = await sale_toggle(req);
    res.status(status || 200).send(response);
});

module.exports = router;
