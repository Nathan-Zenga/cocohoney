const router = require('express').Router();
const bcrypt = require('bcrypt');
const cloud = require('cloudinary').v2;
const { waterfall } = require('async');
const isAuthed = require('../modules/auth-check-customer');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Member, Order } = require('../models/models');

router.get('/', isAuthed, async (req, res) => {
    const { user } = res.locals;
    const orders = await Order.find({ customer_email: user.email }).sort({ created_at: -1 }).exec();
    res.render('customer-account', { title: "My Account", pagename: "account", orders });
});

router.get('/login', (req, res) => {
    if (req.isAuthenticated() || res.locals.user) return res.redirect(req.get("referrer"));
    res.render('customer-login', { title: "Sign Up / Log In", pagename: "customer-login" })
});

router.get('/signup', (req, res) => res.redirect("/account/login"));

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    Member.findOne({ email }, (err, member) => {
        if (err) return res.status(500).send(err);
        if (!member) return res.status(400).send("Credentials are invalid, or this account is not registered");
        bcrypt.compare(password, member.password, (err, match) => {
            if (err) return res.status(500).send(err);
            if (!match) return res.status(400).send("Credentials are invalid, or this account is not registered");
            req.session.user = member;
            res.send("/account");
        });
    });
});

router.get('/logout', (req, res) => {
    req.session.user = null;
    req.session.cart = [];
    res.redirect("/");
});

router.post('/signup', (req, res) => {
    const { firstname, lastname, email_new, phone_number, password_new, password_confirm } = req.body;
    Member.findOne({ email }, (err, existing) => {
        if (existing) return res.status(400).send("This email is already registered");
        if (password_new !== password_confirm) return res.status(400).send("Confirmed password does not match");

        const member = new Member({ firstname, lastname, email: email_new, phone_number });
        bcrypt.hash(password_new, 10, (err, hash) => {
            if (err) return res.status(500).send(err.message);
            member.password = hash;
            member.save((err, saved) => {
                if (err) return res.status(500).send(err.message);
                new MailingListMailTransporter({ req, res }, saved).sendMail({
                    subject: `You have successfully signed up with Cocohoney Cosmetics!`,
                    message: `Hi ${saved.firstname} ${saved.lastname},\n\n` +
                    "This is a confirmation email to let you know that your account has been successfully set up. " +
                    `You can now log in here:\n\n${res.locals.location_origin}/account/login\n\n` +
                    "Thank you for signing up with Cocohoney Cosmetics!"
                }, err => {
                    if (err) return res.status(500).send(err.message);
                    res.send("You have successfully signed up and can now log in");
                });
            });
        });
    })
});

router.post('/edit', isAuthed, (req, res) => {
    const { id, firstname, lastname, email, phone_number, image_file, image_url } = req.body;
    Member.findById(id, (err, member) => {
        if (err) return res.status(500).send(err.message);
        if (!member) return res.status(404).send("Customer not found");
        if (firstname)    member.firstname = firstname;
        if (lastname)     member.lastname = lastname;
        if (email)        member.email = email;
        if (phone_number) member.phone_number = phone_number;

        member.save((err, saved) => {
            if (err) return res.status(500).send(err.message);
            req.session.user = saved;
            if (!image_file.trim() && !image_url.trim()) return res.send("Account details updated");
            const public_id = `cocohoney/customer/profile-img/${saved.firstname}-${saved.id}`.replace(/[ ?&#\\%<>]/g, "_");
            cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                if (err) return res.status(500).send(err.message);
                saved.image = { p_id: result.public_id, url: result.secure_url };
                saved.save(() => {
                    req.session.user = saved;
                    res.send("Account details updated");
                });
            });
        });
    });
});

router.post('/delete', isAuthed, (req, res) => {
    const { id } = Object.keys(req.body).length ? req.body : req.query;
    Member.findByIdAndDelete(id, (err, member) => {
        if (err) return res.status(500).send(err.message);
        if (!member) return res.status(404).send("Account does not exist or already deleted");
        new MailingListMailTransporter({ req, res }, { email: member.email }).sendMail({
            subject: `Your account is now deleted`,
            message: `Hi ${member.firstname},\n\n` +
            "Your account is now successfully deleted. Sorry to see you go!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) return res.status(500).send(err.message);
            res.send("Your account is now successfully deleted. Check your inbox for confirmation.\n\n- Cocohoney Cosmetics");
        });
    });
});

module.exports = router;
