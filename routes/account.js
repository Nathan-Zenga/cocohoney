const router = require('express').Router();
const bcrypt = require('bcrypt');
const cloud = require('cloudinary').v2;
const crypto = require('crypto');
const isAuthed = require('../modules/auth-check-customer');
const MailTransporter = require('../modules/mail-transporter');
const { Member, Order, Wishlist, Product } = require('../models/models');
const passport = require('../config/passport');

router.get('/', isAuthed, async (req, res) => {
    const orders = await Order.find({ customer_email: req.user.email }).sort({ created_at: -1 }).exec();
    const wishlist = await Wishlist.findOne({ customer_id: req.user._id });
    const wishlist_items = await Product.find({ _id: { $in: (wishlist || {}).items || [] } });
    res.render('customer-account', { title: "My Account", pagename: "account", orders, wishlist: wishlist_items });
});

router.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/");
    res.render('customer-login', { title: "Sign Up / Log In", pagename: "customer-login" })
});

router.get('/signup', (req, res) => res.redirect("/account/login#signup"));

router.post('/login', (req, res) => {
    if (req.isAuthenticated()) return res.status(400).send("Please log out first");
    passport.authenticate("local-login-customer", (err, user, info) => {
        if (err) return res.status(500).send(err.message);
        if (!user) return res.status(400).send(info.message);
        req.login(user, err => {
            if (err) return res.status(500).send(err.message);
            res.locals.cart = req.session.cart = [];
            res.send("/account");
        });
    })(req, res);
});

router.get('/logout', (req, res) => {
    req.logout();
    req.session.cart = [];
    res.redirect("/");
});

router.post('/signup', async (req, res) => {
    try {
        if (req.isAuthenticated()) return res.status(400).send("Please log out first");
        const { firstname, lastname, email_new, phone_number, password_new, password_confirm } = req.body;
        const existing = await Member.findOne({ email: email_new });
        if (existing) return res.status(400).send("This email is already registered");
        if (password_new !== password_confirm) return res.status(400).send("Confirmed password does not match");
        const member = new Member({ firstname, lastname, email: email_new, phone_number });
        member.password = await bcrypt.hash(password_new, 10);
        const saved = await member.save();
        const subject = `You have successfully signed up with Cocohoney Cosmetics!`;
        const message = `Hi ${saved.firstname} ${saved.lastname},\n\n` +
            "This is a confirmation email to let you know that your account has been successfully set up\n\n" +
            `((LOGIN))[${res.locals.location_origin}/account/login]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/account/login)</small>\n\n` +
            "Thank you for signing up with Cocohoney Cosmetics!";
        await new MailTransporter({ email: saved.email }).sendMail({ subject, message });
        res.send("You have successfully signed up and can now log in");
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/edit', isAuthed, async (req, res) => {
    const { id, firstname, lastname, email, phone_number, image_file, image_url, mail_sub } = req.body;
    try {
        const member = await Member.findById(id);
        if (!member) return res.status(404).send("Customer not found");
        if (firstname)    member.firstname = firstname;
        if (lastname)     member.lastname = lastname;
        if (email)        member.email = email;
        if (phone_number) member.phone_number = phone_number;
        member.mail_sub = !!mail_sub;

        const public_id = `cocohoney/customer/profile-img/${member.firstname}-${member.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = image_file || image_url ? await cloud.uploader.upload(image_url || image_file, { public_id }) : null;
        if (result) member.image = { p_id: result.public_id, url: result.secure_url };
        await member.save(); res.send("Account details updated");
    } catch (err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/delete', isAuthed, async (req, res) => {
    const id = req.body.id || req.query.id;
    try {
        const member = await Member.findById(id);
        if (!member) return res.status(404).send("Account does not exist or already deleted");
        await Wishlist.findOneAndDelete({ customer_id: member.id });
        await cloud.api.delete_resources([(member.image || {}).p_id || "blank"]);
        await Member.findByIdAndDelete(member.id);
        const subject = "Your account is now deleted";
        const message = `Hi ${member.firstname},\n\n` +
        "Your account is now successfully deleted. Sorry to see you go!\n\n- Cocohoney Cosmetics";
        await new MailTransporter({ email: member.email }).sendMail({ subject, message });

        if (req.user && req.user._id == member.id) {
            req.logout();
            res.locals.cart = req.session.cart = [];
        }
        res.send("Your account is now successfully deleted. Check your inbox for confirmation.\n\n- Cocohoney Cosmetics");
    } catch (err) { res.status(err.statusCode || 500).send(err.message) }
});

router.get('/password-reset-request', (req, res) => {
    const title = "Password Reset Request";
    const pagename = "password-reset";
    res.render('password-reset-request-customer', { title, pagename });
});

router.get('/password-reset', async (req, res) => {
    const { token } = req.query;
    const member = await Member.findOne({ password_reset_token: token });
    if (!member) return res.status(400).send("Invalid password reset token");
    const title = "Password Reset";
    const pagename = "password-reset";
    res.render('password-reset-customer', { title, pagename, id: member.id });
});

router.post('/password-reset-request', async (req, res) => {
    const { email } = req.body;
    const member = await Member.findOne({ email });
    const mail_transporter = new MailTransporter();
    if (!member) return res.status(404).send("Cannot find you on our system");
    member.password_reset_token = crypto.randomBytes(20).toString("hex");
    const saved = await member.save();
    const subject = "Your Password Reset Token";
    const message = "You are receiving this email because you requested to reset your password.\n\n" +
    "Please click the link below to proceed:\n\n" +
    `((RESET PASSWORD))[${res.locals.location_origin}/account/password-reset?token=${saved.password_reset_token}]\n` +
    `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/account/password-reset?token=${saved.password_reset_token})</small>`;
    mail_transporter.setRecipient({ email: saved.email }).sendMail({ subject, message }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("An email has been sent your email to reset your password");
    });
});

router.post('/password-reset', async (req, res) => {
    const { password, password_confirm, id } = req.body;
    if (password !== password_confirm) return res.status(400).send("Passwords do not match");
    try {
        const member = await Member.findById(id);
        if (!member) return res.status(404).send("Cannot find you on our system");
        member.password = await bcrypt.hash(password, 10);
        member.password_reset_token = undefined;
        await member.save(); res.send("Password has been reset!\n\n You can now log in");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
