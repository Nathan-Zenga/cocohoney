const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const isAuthed = require('../modules/authCheck');
const { Ambassador, Discount_code, Product, Order } = require('../models/models');
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
            "Please click the link below to verify them:\n" +
            `${res.locals.location_origin}/ambassador/register/verify?token=${saved.token}\n\n` +
            "Click below to add a discount code to their account <b><u>after verifying them</u></b>:\n\n" +
            `${res.locals.location_origin}/ambassador/discount_code/add?src=email&id=${saved.id}\n\n`
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
            message: "Hello,\n\n Your account has been verified and confirmed by " +
            "the administrator of Cocohoney Cosmetics.\n\n" +
            "Please click the following link below to activate your account:\n" +
            `${res.locals.location_origin}/ambassador/register/activate?token=${amb.token}`
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
    const { id, password, password_confirm, sort_code, account_number } = req.body;
    if (password !== password_confirm) return res.status(400).send("Password confirm does not match");
    Ambassador.findOne({ _id: id, verified: true }, (err, amb) => {
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
    res.render('ambassador-login', { title: "Ambassador Login", pagename: "ambassador-login" })
});

router.get('/account', isAuthed, async (req, res) => {
    const { user } = res.locals;
    const discount_code = await Discount_code.findOne({ code: user.discount_code });
    const { orders_applied } = discount_code || {};
    const orders = await Order.find({ _id: { $in: orders_applied || [] } });
    const products = await Product.find();
    const docs = { discount_code, orders, products };
    const opts = { title: "My Account | Ambassador", pagename: "account", ...docs };
    res.render('ambassador-account', opts);
});

router.post('/account/login', (req, res, next) => {
    if (req.isAuthenticated() || res.locals.user) return res.redirect(req.get("referrer"));
    const { email, password } = req.body;
    Ambassador.findOne({ email }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(400).send("Credentials are invalid, or this account is not registered");
        bcrypt.compare(password, amb.password, (err, match) => {
            if (err) return res.status(500).send(err.message);
            if (!match) return res.status(400).send("Credentials are invalid, or this account is not registered");
            req.session.user = amb;
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
    const { id, firstname, lastname, email, phone_number, instagram, sort_code, account_number } = req.body;
    Ambassador.findById(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (firstname)      amb.firstname = firstname;
        if (lastname)       amb.lastname = lastname;
        if (email)          amb.email = email;
        if (phone_number)   amb.phone_number = phone_number;
        if (instagram)      amb.instagram = instagram;
        if (sort_code)      amb.sort_code = sort_code;
        if (account_number) amb.account_number = account_number;
        amb.save((err, saved) => {
            if (err) return res.status(500).send(err.message);
            if (res.locals.is_ambassador) req.session.user = saved;
            res.send("Account details updated");
        });
    });
});

router.post('/delete', isAuthed, (req, res) => {
    const { id } = Object.keys(req.body).length ? req.body : req.query;
    Ambassador.findByIdAndDelete(id, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account does not exist or already deleted");
        new MailingListMailTransporter({ req, res }, { email: amb.email }).sendMail({
            subject: "Your account is now deleted",
            message: `Hi ${amb.firstname},\n\n` +
            "Your account is now successfully deleted.\n" +
            "Thank you for your service as an ambassador!\n\n- Cocohoney Cosmetics"
        }, err => {
            if (err) return res.status(500).send(err.message);
            res.send("Your account is now successfully deleted. Check your inbox for confirmation.\n\n- Cocohoney Cosmetics");
        });
    });
});

router.get('/discount_code/add', (req, res) => {
    const { id, src } = req.query;
    if (!id || src !== "email") return res.status(400).send("Invalid entry");
    Ambassador.findOne({ _id: id, verified: true }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Account not found or isn't verified");
        if (amb.discount_code === "null") return res.status(400).send("Account already has a discount code");
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

// router.get('/test', (req, res) => {
//     [{
//         firstname: "Ciara",
//         password: "Cocohoneyyellow",
//         discount_code: "MODICH01",
//         verified: true
//     },{
//         firstname: "Akira",
//         password: "Cocohoneyblue",
//         discount_code: "AKIRCH02",
//         verified: true
//     },{
//         firstname: "Denise",
//         password: "Cocohoneypurple",
//         discount_code: "DENISECH03",
//         verified: true
//     },{
//         firstname: "Maita",
//         password: "Cocohoneyred",
//         discount_code: "MAITACH04",
//         verified: true
//     },{
//         firstname: "Raissa ",
//         password: "Cocohoneypink",
//         discount_code: "RICECH05",
//         verified: true
//     },{
//         firstname: "Claire",
//         password: "Cocohoneybrown",
//         discount_code: "CLAIRECH06",
//         verified: true
//     },{
//         firstname: "Stephany",
//         password: "Cocohoneyorange",
//         discount_code: "STEPHCH07",
//         verified: true
//     },{
//         firstname: "Helen ",
//         password: "Cocohoneygreen",
//         discount_code: "HELENCH08",
//         verified: true
//     },{
//         firstname: "Kyra ",
//         password: "Cocohoneyblack",
//         discount_code: "KYRACH09",
//         verified: true
//     },{
//         firstname: "Mayo ",
//         password: "Cocohoneywhite",
//         discount_code: "MAYOCH10",
//         verified: true
//     },{
//         firstname: "Nessa",
//         password: "Cocohoneygrey",
//         discount_code: "NESSACH11",
//         verified: true
//     },{
//         firstname: "Nyasha",
//         password: "Cocohoneyindigo",
//         discount_code: "NYASHACH12",
//         verified: true
//     },{
//         firstname: "Thema",
//         password: "Cocohoneyviolet",
//         discount_code: "THEMACH13",
//         verified: true
//     },{
//         firstname: "Benedicta ",
//         password: "Cocohoneygold",
//         discount_code: "BENEDICH14",
//         verified: true
//     },{
//         firstname: "Sandra ",
//         password: "Cocohoneylime",
//         discount_code: "SANDRACH15",
//         verified: true
//     },{
//         firstname: "Racheal ",
//         password: "Cocohoneypeach",
//         discount_code: "RACHCH16",
//         verified: true
//     },{
//         firstname: "Josphin",
//         password: "Cocohoneysilver",
//         discount_code: "JOSPHCH17",
//         verified: true
//     },{
//         firstname: "Deanna",
//         password: "Cocohoneycream",
//         discount_code: "DEANNACH18",
//         verified: true
//     }].forEach((amb, i, arr) => {
//         const { firstname, password, discount_code } = amb;
//         new Ambassador({ firstname, password, amb_ref: password, discount_code, verified: true }).save({ validateBeforeSave: false }, err => {
//             if (i === arr.length-1) res.send("DONE!!!");
//         })
//     })    
// });

module.exports = router;
