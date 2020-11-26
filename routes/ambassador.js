const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cloud = require('cloudinary').v2;
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const isAuthed = require('../modules/auth-check-ambassador');
const countries = require("../modules/country-list");
const send_verification_email = require("../modules/send-ambassador-verification-email");
const { Ambassador, Discount_code, Product, Order, Wishlist, Subscriber } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');
const { each } = require('async');
const passport = require('../config/passport');

router.get('/register', (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/");
    res.render('ambassador-register', { title: "Ambassador Registration", pagename: "ambassador-register", countries })
});

router.post('/register', async (req, res) => {
    try {
        if (req.isAuthenticated()) return res.status(400).send("Please log out first");
        const { firstname, lastname, email, phone_number, line1, line2, city, state, country, postcode, instagram, image_file, image_url } = req.body;
        const existing = await Ambassador.findOne({ email });
        if (existing) return res.status(400).send("This email is already registered");
        const ambassador = new Ambassador({ firstname, lastname, email, phone_number, instagram });
        ambassador.address = { line1, line2, city, state, country, postcode };
        ambassador.token = crypto.randomBytes(20).toString("hex");
        const public_id = `cocohoney/ambassador/profile-img/${ambassador.firstname}-${ambassador.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = image_file || image_url ? await cloud.uploader.upload(image_url || image_file, { public_id }) : null;
        if (result) ambassador.image = { p_id: result.public_id, url: result.secure_url };
        const saved = await ambassador.save();
        const subject = `Account verification: ${saved.firstname} ${saved.lastname} wants to be an Ambassador`;
        const message = "The following candidate wants to sign up as an ambassador.\n\n" +
            `${saved.firstname} ${saved.lastname} (${saved.email})\n\n` +
            "Please click the link below to verify them:\n" +
            `((VERIFY))[${res.locals.location_origin}/ambassador/register/verify?token=${saved.token}]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/register/verify?token=${saved.token})</small>\n\n` +
            "Click below to add a discount code to their account <b><u>after verifying them</u></b>:\n\n" +
            `((ADD DISCOUNT CODE))[${res.locals.location_origin}/ambassador/discount_code/add?src=email&id=${saved._id}]\n` +
            `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/discount_code/add?src=email&id=${saved._id})</small>\n\n`;

        await new MailTransporter({ email: process.env.CHC_EMAIL }).sendMail({ subject, message });
        res.send("Registered. Submitted to administration for verification")
    } catch (err) { return res.status(err.http_code || 500).send(err.message) }
});

router.get('/register/verify', send_verification_email);
router.post('/register/verify', send_verification_email);

router.get('/register/activate', async (req, res, next) => {
    const { token } = req.query;
    const amb = await Ambassador.findOne({ token });
    if (!amb) return next();
    const title = "Ambassador Account Activation";
    const pagename = "ambassador-activate";
    res.render('ambassador-activate', { title, pagename, id: amb.id })
});

router.post('/register/activate', async (req, res) => {
    if (req.isAuthenticated()) return res.status(400).send("Please log out first");
    const { id, password, password_confirm, sort_code, account_number } = req.body;
    if (password !== password_confirm) return res.status(400).send("Password confirm does not match");
    try {
        const amb = await Ambassador.findById(id);
        if (!amb) return res.status(404).send("Invalid entry - account not found");
        amb.password = await bcrypt.hash(password, 10);
        amb.sort_code = sort_code;
        amb.account_number = account_number;
        amb.token = undefined;
        await amb.save(); res.send("Your account is now activated!\nYou can now log in.")
    } catch (err) { res.status(500).send(err.message) }
});

router.get('/account/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/");
    res.render('ambassador-login', { title: "Ambassador Login", pagename: "ambassador-login" })
});

router.get('/account', async (req, res) => {
    if (!res.locals.is_ambassador) return res.redirect("/");
    const { user } = res.locals;
    const discount_code = await Discount_code.findOne({ code: user.discount_code });
    const { orders_applied } = discount_code || {};
    const orders = await Order.find({ _id: { $in: orders_applied || [] } });
    const products = await Product.find();
    const wishlist = await Wishlist.findOne({ customer_id: user._id });
    const wishlist_items = await Product.find({ _id: { $in: wishlist?.items || [] } });
    const subscriber_docs = await Subscriber.find({ "customer.member_id": user._id });
    const subscriptions_all = await Stripe.subscriptions.list({ expand: ["data.customer", "data.latest_invoice", "data.default_payment_method"] });
    const subscriptions = subscriptions_all.data.filter(sub => subscriber_docs.find(subscriber => sub.id === subscriber.sub_id));
    const subscription_products = await Stripe.products.list({ ids: subscriptions.map(s => s.items.data[0].price.product) });
    const docs = { ambassador: null, discount_code, orders, products, wishlist: wishlist_items, subscriptions, subscription_products };
    const opts = { title: "My Account | Ambassador", pagename: "account", countries, ...docs };
    res.render('ambassador-account', opts);
});

router.post('/account/login', (req, res) => {
    if (req.isAuthenticated()) return res.status(400).send("Please log out first");
    passport.authenticate("local-login-ambassador", (err, user, info) => {
        if (err) return res.status(500).send(err.message);
        if (!user) return res.status(400).send(info.message);
        req.login(user, err => {
            if (err) return res.status(500).send(err.message);
            res.locals.cart = req.session.cart = [];
            res.send("/ambassador/account");
        });
    })(req, res);
});

router.get('/account/logout', (req, res) => { 
    req.logout(() => {
        req.session.cart = [];
        res.redirect("/");
    });
});

router.post('/account/edit', isAuthed, async (req, res) => {
    const { id, firstname, lastname, email, phone_number, instagram, sort_code, account_number, line1, line2, city, state, country, postcode, image_file, image_url, mail_sub } = req.body;
    try {
        const amb = await Ambassador.findById(id);
        if (!amb) return res.status(500).send("Ambassador not found");
        if (firstname)      amb.firstname = firstname;
        if (lastname)       amb.lastname = lastname;
        if (email)          amb.email = email;
        if (phone_number)   amb.phone_number = phone_number;
        if (instagram)      amb.instagram = instagram;
        if (sort_code)      amb.sort_code = sort_code;
        if (account_number) amb.account_number = account_number;
        if (line1)          amb.address.line1 = line1;
        if (line2)          amb.address.line2 = line2;
        if (city)           amb.address.city = city;
        if (country)        amb.address.country = country;
        if (state)          amb.address.state = state;
        if (postcode)       amb.address.postcode = postcode;
                            amb.mail_sub = !!mail_sub;

        const public_id = `cocohoney/ambassador/profile-img/${amb.firstname}-${amb.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = image_url || image_file ? await cloud.uploader.upload(image_url || image_file, { public_id }) : null;
        if (result) await cloud.api.delete_resources([amb.image.p_id]).catch(err => console.error(err.message));
        if (result) amb.image = { p_id: result.public_id, url: result.secure_url };
        await amb.save(); res.send("Account details updated");
    } catch (err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/delete', async (req, res) => {
    try {
        const amb = await Ambassador.findById(req.body.id);
        if (!amb) return res.status(404).send("Account does not exist or already deleted");
        await Wishlist.findOneAndDelete({ customer_id: amb.id });
        await cloud.api.delete_resources([amb.image?.p_id || "blank"]);
        await Discount_code.findOneAndDelete({ code: amb.discount_code });

        const subscriber_docs = await Subscriber.find({ "customer.member_id": amb.id });
        const subscriptions_all = await Stripe.subscriptions.list();
        const subscriptions = subscriptions_all.data.filter(sub => subscriber_docs.find(subscriber => sub.id === subscriber.sub_id));
        await each(subscriptions, (sub, cb) => { Stripe.subscriptions.del(sub.id).then(() => cb()).catch(err => cb(err)) });
        await Subscriber.deleteMany({"customer.member_id": amb.id});
        await Ambassador.findByIdAndDelete(amb.id);
        if (res.locals.is_admin) return res.send("The account is now successfully deleted.");

        const subject = "Your account is now deleted";
        const message = `Hi ${amb.firstname},\n\nYour account is now successfully deleted.\n` +
        "Thank you for your service as an ambassador!\n\n- Cocohoney Cosmetics";
        await new MailTransporter({ email: amb.email }).sendMail({ subject, message });
        if (req.user?._id == amb.id) {
            req.logout(() => { res.locals.cart = req.session.cart = [] });
        }
        res.send("Your account is now successfully deleted. Check your inbox for confirmation.\n\n- Cocohoney Cosmetics");
    } catch (err) { res.status(err.statusCode || 500).send(err.message) }
});

router.get('/discount_code/add', async (req, res) => {
    const { id, src } = req.query;
    if (!id || src !== "email") return res.status(400).send("Invalid entry");

    try {
        const amb = await Ambassador.findOne({ _id: id, verified: true });
        if (!amb) return res.status(404).send("Account not found or isn't verified");
        if (amb.discount_code !== "null") return res.status(400).send("Account already has a discount code");
        const title = "Add Ambassador Discount Code";
        const pagename = "ambassador-discount-code-add";
        res.render('ambassador-discount-code-add', { title, pagename, id: amb.id })
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/discount_code/add', async (req, res) => {
    const { id, code } = req.body;
    try {
        const amb = await Ambassador.findOne({ _id: id, verified: true });
        if (!amb) return res.status(404).send("Account not found or isn't verified");
        amb.discount_code = code;
        await amb.save();
        const dc = await Discount_code.findOne({ code });
        if (!dc) await Discount_code.create({ code, percentage: 10, expiry_date: new Date(Date.now() + 31556952000) });
        res.send(`New discount code saved and added for ${amb.firstname} ${amb.lastname}`);
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/discount_code/edit', async (req, res) => {
    const { id, code } = req.body;
    if (!code) return res.status(400).send("No valid discount code provided");
    try {
        const amb = await Ambassador.findById(id);
        if (!amb) return res.status(404).send("Account not found");
        const dc = await Discount_code.findOne({ code });
        if (!dc) return res.status(404).send("The given discount code doesn't exist");

        amb.discount_code = code; await amb.save();
        dc.code = code; await dc.save();
        res.send(`Discount code updated for ${amb.firstname} ${amb.lastname}`);
    } catch (err) { res.status(500).send(err.message) }
});

router.get('/password-reset-request', (req, res) => {
    const title = "Password Reset Request";
    const pagename = "password-reset";
    res.render('password-reset-request-ambassador', { title, pagename });
});

router.get('/password-reset', async (req, res) => {
    try {
        const amb = await Ambassador.findOne({ password_reset_token: req.query.token });
        const title = "Password Reset";
        const pagename = "password-reset";
        if (!amb) return res.status(400).send("Invalid password reset token");
        res.render('password-reset-ambassador', { title, pagename, id: amb.id });
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/password-reset-request', async (req, res) => {
    const ambassador = await Ambassador.findOne({ email: req.body.email });
    if (!ambassador) return res.status(404).send("Cannot find you on our system");
    ambassador.password_reset_token = crypto.randomBytes(20).toString("hex");
    const saved = await ambassador.save();
    const subject = "Your Password Reset Token";
    const password_reset_link = `${res.locals.location_origin}/ambassador/password-reset?token=${saved.password_reset_token}`;
    const message = "You are receiving this email because you requested to reset your password.\n\n" +
    "Please click the link below to proceed:\n\n" +
    `((RESET PASSWORD))[${password_reset_link}]\n` +
    `<small>(Copy the URL if the above link is not working - ${password_reset_link})</small>\n\n`;
    new MailTransporter({ email: saved.email }).sendMail({ subject, message }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("An email has been sent your email to reset your password");
    });
});

router.post('/password-reset', async (req, res) => {
    const { password, password_confirm, id } = req.body;
    if (password !== password_confirm) return res.status(400).send("Passwords do not match");
    try {
        const amb = await Ambassador.findById(id);
        if (!amb) return res.status(404).send("Cannot find you on our system");
        amb.password = await bcrypt.hash(password, 10);
        amb.password_reset_token = undefined;
        await amb.save(); res.send("Password has been reset!\n\n You can now log in");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
