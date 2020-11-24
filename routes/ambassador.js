const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-ambassador');
const countries = require("../modules/country-list");
const send_verification_email = require("../modules/send-ambassador-verification-email");
const { Ambassador, Discount_code, Product, Order, Wishlist } = require('../models/models');
const MailTransporter = require('../modules/mail-transporter');

router.get('/register', (req, res) => {
    res.render('ambassador-register', { title: "Ambassador Registration", pagename: "ambassador-register", countries })
});

router.post('/register', (req, res) => {
    const { firstname, lastname, email, phone_number, line1, line2, city, country, postcode, instagram, image_file, image_url } = req.body;
    const ambassador = new Ambassador({ firstname, lastname, email, phone_number, instagram });
    ambassador.address = { line1, line2, city, country, postcode };
    ambassador.save((err, saved) => {
        if (err) return res.status(400).send(err.message);

        const public_id = `cocohoney/ambassador/profile-img/${saved.firstname}-${saved.id}`.replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image_url || image_file || "", { public_id }, (err, result) => {
            if (err && (image_file || image_url)) return res.status(500).send(err.message);
            if (result) saved.image = { p_id: result.public_id, url: result.secure_url };
            saved.token = crypto.randomBytes(20).toString("hex");
            saved.save((err, amb) => {
                if (err) return res.status(500).send(err.message);
                const mail_transporter = new MailTransporter({ req, res });
                const subject = `Account verification: ${amb.firstname} ${amb.lastname} wants to be an Ambassador`;
                const message = "The following candidate wants to sign up as an ambassador.\n\n" +
                    `${amb.firstname} ${amb.lastname} (${amb.email})\n\n` +
                    "Please click the link below to verify them:\n" +
                    `((VERIFY))[${res.locals.location_origin}/ambassador/register/verify?token=${amb.token}]\n` +
                    `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/register/verify?token=${amb.token})</small>\n\n` +
                    "Click below to add a discount code to their account <b><u>after verifying them</u></b>:\n\n" +
                    `((ADD DISCOUNT CODE))[${res.locals.location_origin}/ambassador/discount_code/add?src=email&id=${amb._id}]\n` +
                    `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/discount_code/add?src=email&id=${amb._id})</small>\n\n`;

                mail_transporter.setRecipient({ email: req.session.admin_email });
                mail_transporter.sendMail({ subject, message }, err => {
                    if (err) return res.status(500).send(err.message || err);
                    res.send("Registered. Submitted to administration for verification")
                });
            });
        });
    });
});

router.get('/register/verify', send_verification_email);
router.post('/register/verify', send_verification_email);

router.get('/register/activate', (req, res, next) => {
    const { token } = req.query;
    Ambassador.findOne({ token }, (err, amb) => {
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
    const { id, password, password_confirm, sort_code, account_number } = req.body;
    if (password !== password_confirm) return res.status(400).send("Password confirm does not match");
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Invalid entry: account not found");
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).send(err.message);
            amb.password = hash;
            amb.sort_code = sort_code;
            amb.account_number = account_number;
            amb.token = undefined;
            amb.save(err => {
                if (err) return res.status(500).send(err.message);
                res.send("Your account is now activated!\nYou can now log in.")
            });
        });
    });
});

router.get('/account/login', (req, res) => {
    if (req.isAuthenticated() || res.locals.user) return res.redirect("/");
    res.render('ambassador-login', { title: "Ambassador Login", pagename: "ambassador-login" })
});

router.get('/account', isAuthed, async (req, res) => {
    const { user } = res.locals;
    const discount_code = await Discount_code.findOne({ code: user.discount_code });
    const { orders_applied } = discount_code || {};
    const orders = await Order.find({ _id: { $in: orders_applied || [] } });
    const products = await Product.find();
    const wishlist = await Wishlist.findOne({ customer_id: user._id });
    const wishlist_items = await Product.find({ _id: { $in: (wishlist || {}).items || [] } });
    const docs = { ambassador: null, discount_code, orders, products, wishlist: wishlist_items };
    const opts = { title: "My Account | Ambassador", pagename: "account", countries, ...docs };
    res.render('ambassador-account', opts);
});

router.post('/account/login', (req, res) => {
    const { email, password } = req.body;
    Ambassador.findOne({ email }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(400).send("Credentials are invalid, or this account is not registered");
        bcrypt.compare(password, amb.password, (err, match) => {
            if (err) return res.status(500).send(err.message);
            if (!match) return res.status(400).send("Credentials are invalid, or this account is not registered");
            req.session.user = amb;
            res.locals.cart = req.session.cart = [];
            res.send("/ambassador/account");
        });
    });
});

router.get('/account/logout', (req, res) => { 
    req.session.user = null;
    req.session.cart = [];
    res.redirect("/");
});

router.post('/account/edit', isAuthed, (req, res) => {
    const { id, firstname, lastname, email, phone_number, instagram, sort_code, account_number, line1, line2, city, country, postcode, image_file, image_url } = req.body;
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
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
        if (postcode)       amb.address.postcode = postcode;

        amb.save((err, saved) => {
            if (err) return res.status(500).send(err.message);
            res.locals.user = req.session.user = saved;
            if (!image_file && !image_url) return res.send("Account details updated");
            const public_id = `cocohoney/ambassador/profile-img/${saved.firstname}-${saved.id}`.replace(/[ ?&#\\%<>]/g, "_");
            cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                if (err) return res.status(500).send(err.message);
                saved.image = { p_id: result.public_id, url: result.secure_url };
                saved.save(() => {
                    res.locals.user = req.session.user = saved;
                    res.send("Account details updated");
                });
            });
        });
    });
});

router.post('/delete', (req, res) => {
    const { id } = req.body;
    Ambassador.findByIdAndDelete(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account does not exist or already deleted");
        Wishlist.findOneAndDelete({ customer_id: amb.id }, err => {
            if (err) return res.status(500).send(err.message);
            cloud.api.delete_resources([(amb.image || {}).p_id], err => {
                Discount_code.findByIdAndDelete({ code: amb.discount_code }, err => {
                    if (res.locals.is_admin) {
                        return res.send("The account is now successfully deleted.");
                    };
                    new MailTransporter({ req, res }, { email: amb.email }).sendMail({
                        subject: "Your account is now deleted",
                        message: `Hi ${amb.firstname},\n\n` +
                        "Your account is now successfully deleted.\n" +
                        "Thank you for your service as an ambassador!\n\n- Cocohoney Cosmetics"
                    }, err => {
                        if (err) return res.status(500).send(err.message || err);
                        if (res.locals.user && res.locals.user._id == amb.id) {
                            res.locals.user = req.session.user = null;
                            res.locals.cart = req.session.cart = [];
                        }
                        res.send("Your account is now successfully deleted. Check your inbox for confirmation.\n\n- Cocohoney Cosmetics");
                    });
                })
            })
        })
    });
});

router.get('/discount_code/add', (req, res) => {
    const { id, src } = req.query;
    if (!id || src !== "email") return res.status(400).send("Invalid entry");
    Ambassador.findOne({ _id: id, verified: true }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account not found or isn't verified");
        if (amb.discount_code !== "null") return res.status(400).send("Account already has a discount code");
        res.render('ambassador-discount-code-add', {
            title: "Add Ambassador Discount Code",
            pagename: "ambassador-discount-code-add",
            id: amb.id
        })
    });
});

router.post('/discount_code/add', (req, res) => {
    const { id, code } = req.body;
    Ambassador.findOne({ _id: id, verified: true }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account not found or isn't verified");
        amb.discount_code = code;
        amb.save(err => {
            if (err) return res.status(500).send(err.message);
            Discount_code.findOne({ code }, (err, dc) => {
                if (err) return res.status(500).send(err.message);
                if (dc) return res.send(`Discount code added for ${amb.firstname} ${amb.lastname}`);
                new Discount_code({ code, percentage: 10, expiry_date: new Date(Date.now() + 31556952000) }).save(err => {
                    if (err) return res.status(500).send(err.message);
                    res.send(`New discount code saved and added for ${amb.firstname} ${amb.lastname}`);
                });
            });
        })
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
            if (!code) return res.send(`Discount code updated for ${amb.firstname} ${amb.lastname}`);
            Discount_code.findOne({ code }, (err, dc) => {
                if (dc) { dc.code = code; dc.save() }
                res.send(`Discount code updated for ${amb.firstname} ${amb.lastname}`);
            })
        });
    });
});

router.get('/password-reset-request', (req, res) => {
    res.render('password-reset-request-ambassador', {
        title: "Password Reset Request",
        pagename: "password-reset"
    });
});

router.get('/password-reset', (req, res) => {
    const { token } = req.query;
    Ambassador.findOne({ password_reset_token: token }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(400).send("Invalid password reset token");
        res.render('password-reset-ambassador', {
            title: "Password Reset",
            pagename: "password-reset",
            id: amb.id
        });
    })
});

router.post('/password-reset-request', async (req, res) => {
    const { email } = req.body;
    const ambassador = await Ambassador.findOne({ email });
    const mail_transporter = new MailTransporter({ req, res });
    if (!ambassador) return res.status(404).send("Cannot find you on our system");
    ambassador.password_reset_token = crypto.randomBytes(20).toString("hex");
    const saved = await ambassador.save();
    mail_transporter.setRecipient(saved).sendMail({
        subject: "Your Password Reset Token",
        message: "You are receiving this email because you requested to reset your password.\n\n" +
        "Please click the link below to proceed:\n\n" +
        `((RESET PASSWORD))[${res.locals.location_origin}/ambassador/password-reset?token=${saved.password_reset_token}]\n` +
        `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/password-reset?token=${saved.password_reset_token})</small>\n\n`
    }, err => {
        if (err) return res.status(500).send(err.message || err);
        res.send("An email has been sent your email to reset your password");
    });
});

router.post('/password-reset', (req, res) => {
    const { password, password_confirm, id } = req.body;
    if (password !== password_confirm) return res.status(400).send("Passwords do not match");
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Cannot find you on our system");
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).send(err.message);
            amb.password = hash;
            amb.password_reset_token = undefined;
            amb.save(err => {
                if (err) return res.status(500).send(err.message);
                res.send("Password has been reset!\n\n You can now log in");
            })
        })
    })
});

module.exports = router;
