const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const passport = require('passport');
const { CHCDB, NODE_ENV, PORT = 2020 } = process.env;
const { Banner_slide, Sale, Product, Box, MailTest } = require("./models/models");
const checkout_cancel = require('./modules/checkout-cancel');
const sale_toggle = require('./modules/sale_toggle');
const MailTransporter = require('./modules/mail-transporter');
const visitor = require('./modules/visitor-info');
const production = NODE_ENV === "production";
var timeout = null;

mongoose.connect(CHCDB).then(() => { console.log("Connected to DB") });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // set static folder

app.use(session({ // express session
    secret: 'secret',
    name: 'sesh' + require("crypto").randomBytes(20).toString("hex"),
    saveUninitialized: true,
    resave: true,
    cookie: { secure: 'auto' },
    store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 12 })
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(async (req, res, next) => { // global variables
    const GET = req.method === "GET";
    const sale_doc = GET ? (await Sale.find())[0] : null;
    req.hostname != "localhost" && res.on("finish", () => console.log(visitor(req, res)));
    res.locals.production = production;
    res.locals.url = req.originalUrl;
    res.locals.user = req.user;
    res.locals.is_admin = req.user?.role === "admin";
    res.locals.is_ambassador = req.user?.role === "ambassador";
    res.locals.is_customer = req.user?.role === "member";
    res.locals.location_origin = MailTransporter.location_origin = `${req.protocol}://${req.headers.host}`;
    res.locals.products_all = !GET && res.locals.products_all ? res.locals.products_all : await Product.find().sort({ product_collection: -1, category: 1, name: 1 }).exec();
    res.locals.boxes_all = !GET && res.locals.boxes_all ? res.locals.boxes_all : await Box.find();
    res.locals.banner_slides = !GET && res.locals.banner_slides ? res.locals.banner_slides : await Banner_slide.find().sort({ _id: -1 }).exec();
    res.locals.sale = !sale_doc ? res.locals.sale : sale_doc.active || false;
    res.locals.sale_percentage = !sale_doc ? res.locals.sale_percentage : sale_doc.percentage || false;
    res.locals.sale_sitewide = !sale_doc ? res.locals.sale_sitewide : (res.locals.sale && sale_doc.sitewide) || false;
    res.locals.cart = req.session.cart = Array.isArray(req.session.cart) ? req.session.cart : [];

    const end_datetime_updated = sale_doc?.active && req.session.current_end_datetime !== sale_doc.end_datetime.getTime();
    if (end_datetime_updated) { clearTimeout(timeout); timeout = null }
    if (sale_doc?.active && !timeout) {
        const time_left = sale_doc.end_datetime.getTime() - Date.now();
        const sale_ended = time_left < 0;
        req.session.current_end_datetime = sale_doc.end_datetime.getTime();
        timeout = setTimeout(async () => {
            await sale_toggle(req);
            clearTimeout(timeout);
            timeout = null;
        }, sale_ended ? 0 : time_left)
    }

    if (!req.session.checkout_session || /^\/(shop|events)\/checkout\/(cancel|session\/complete)$/.test(req.originalUrl)) return next();
    checkout_cancel(req, res, next);
});

app.use('/', require('./routes/index'));
app.use('/about', require('./routes/about'));
app.use('/highlights-post', require('./routes/highlights-post'));
app.use('/admin', require('./routes/admin'));
app.use('/product', require('./routes/product'));
app.use('/shop', require('./routes/shop'));
app.use('/shop/checkout', require('./routes/checkout'));
app.use('/shop/checkout/paypal', require('./routes/checkout-paypal'));
app.use('/lookbook', require('./routes/lookbook'));
app.use('/site/content', require('./routes/site-content'));
app.use('/ambassador', require('./routes/ambassador'));
app.use('/shipping', require('./routes/shipping'));
app.use('/deal', require('./routes/deal'));
app.use('/reviews', require('./routes/customer-review'));
app.use('/account', require('./routes/account'));
app.use('/report', require('./routes/report'));
app.use('/wishlist', require('./routes/wishlist'));
app.use('/events', require('./routes/events'));
app.use('/events/checkout', require('./routes/events-checkout'));
app.use('/events/checkout/paypal', require('./routes/events-checkout-paypal'));

app.get("*", (req, res) => {
    const html = `<h1>PAGE ${res.statusCode === 404 ? "IN CONSTRUCTION" : "NOT FOUND"}</h1>`;
    res.status(404).render('error', { title: "Error 404", pagename: "error", html });
});

app.post("*", (req, res) => res.status(400).send("Sorry, your request currently cannot be processed"));

app.listen(PORT, async () => {
    console.log(`Server started${production ? "" : " on port " + PORT}`);

    if (production) try {
        setInterval(async () => {
            const test = await MailTest.findOne() || new MailTest();
            const { email, subject, message, newDay } = test;
            newDay && await new MailTransporter({ email }).sendMail({ subject, message });
            newDay && (test.last_sent_date = Date.now());
            newDay && await test.save();
        }, 1000 * 60 * 10);
    } catch (err) { console.error(err.message) }
});
