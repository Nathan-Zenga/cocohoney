const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const isAuthed = require('../modules/authCheck');
const { Ambassador } = require('../models/models');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');

router.get('/register', (req, res) => {
    res.render('ambassador-register', { title: "Ambassador Registration", pagename: "ambassador-register" })
});

router.post('/register', (req, res) => {
    const { firstname, lastname, email, phone_number, instagram } = req.body;
    new Ambassador({ firstname, lastname, email, phone_number, instagram }).save((err, saved) => {
        if (err) return res.status(400).send(err.message);
        saved.token = crypto.randomBytes(20).toString("hex");
        saved.save();
        new MailingListMailTransporter({ req, res }, { email: req.session.admin_email }).sendMail({
            subject: `Account verification: ${saved.firstname} ${saved.lastname} wants to be an Ambassador`,
            message: "The following candidate wants to sign up as an ambassador.\n\n" +
            `${saved.firstname} ${saved.lastname} (${saved.email})\n\n` +
            "Please click the following link to verify them:\n" +
            `${res.locals.location_origin}/register/verify?token=${saved.token}`
        }, err => res.send("Registered. Submitted to administration for verification"));
    });
});

router.get('/register/verify', (req, res) => {
    const { token } = req.query;
    Ambassador.findOne({ token }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Invalid entry");
        new MailingListMailTransporter({ req, res }, { email: amb.email }).sendMail({
            subject: "Your account is now verified.",
            message: "Hello,\n\n Your account has been verified and confirmed by" +
            "the administrator of Cocohoney Cosmetics.\n\n" +
            "Please click the following link below to activate your account" +
            `${res.locals.location_origin}/register/activate?token=${amb.token}\n\n`
        }, err => {
            if (err) return res.status(500).send(err.message);
            amb.verified = true;
            amb.save(err => res.send(`Registered. Email sent to ${amb.email} for account activation`));
        });
    })
});

router.get('/register/activate', (req, res, next) => {
    const { token } = req.query;
    Ambassador.findOne({ token, verified: true }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return next();
        res.render('ambassador-activate', {
            title: "Ambassador Account Activation",
            pagename: "ambassador-activate",
            id: amb.id
        })
    });
});

router.post('/register/activate', (req, res) => {
    const { id, password, password_confirm } = req.body;
    if (password !== password_confirm) return res.status(400).send("Password confirm does not match");
    Ambassador.findOne({ _id: id, verified: true }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Invalid entry: account not found");
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).send(err.message);
            amb.password = hash;
            amb.token = undefined;
            amb.save(err => {
                if (err) return res.status(500).send(err.message);
                res.send("Your account is now activated!\nYou can now log in.")
            });
        });
    });
});

router.get('/account/login', (req, res) => {
    res.render('ambassador-login', { title: "Ambassador Login", pagename: "ambassador-login" })
});

router.get('/account/logout', (req, res) => {
    // TO DO
});

router.get('/account', (req, res) => {
    // TO DO
    // Ambassador.findById(req.user.id, (err, user) => {
    //     res.render('ambassador-account', { title: "Ambassador Account", pagename: "ambassador-account" })
    // })
});

router.post('/account/login', (req, res) => {
    // TO DO
});

router.post('/account/edit', (req, res) => {
    const { id, firstname, lastname, email, phone_number, instagram } = req.body;
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (firstname)    amb.firstname = firstname;
        if (lastname)     amb.lastname = lastname;
        if (email)        amb.email = email;
        if (phone_number) amb.phone_number = phone_number;
        if (instagram)    amb.instagram = instagram;
        amb.save(err => {
            if (err) return res.status(500).send(err.message);
            res.send("Account details updated");
        });
    });
});

router.post('/discount_code/add', (req, res) => {
    const { id, code } = req.body;
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account not found");
        amb.discount_code = code;
        amb.save(err => {
            if (err) return res.status(500).send(err.message);
            res.send(`Discount code added for ${amb.firstname} ${amb.lastname}`);
        });
    });
});

router.post('/discount_code/edit', (req, res) => {
    const { id, code } = req.body;
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account not found");
        if (code) amb.discount_code = code;
        amb.save(err => {
            if (err) return res.status(500).send(err.message);
            res.send(`Discount code updated for ${amb.firstname} ${amb.lastname}`);
        });
    });
});

module.exports = router;
