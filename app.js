const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const Stripe = new (require('stripe').Stripe)(process.env.STRIPE_SK);
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const { CHCDB, NODE_ENV } = process.env;
const { Site_content, Banner_slide } = require("./models/models");
const production = NODE_ENV === "production";

mongoose.connect(CHCDB, { useNewUrlParser: true, useUnifiedTopology: true, autoIndex: false });
mongoose.connection.once('open', () => { console.log("Connected to DB") });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // set static folder

app.use(session({ // express session
    secret: 'secret',
    name: 'sesh' + require("crypto").randomBytes(20).toString("hex"),
    saveUninitialized: true,
    resave: true,
    cookie: { secure: false },
    store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 12 })
}));

app.use(async (req, res, next) => { // global variables
    req.session.admin_email = "cocohoneycosmetics@gmail.com";
    res.locals.user = req.user || null;
    res.locals.location_origin = production ? `https://${req.hostname}` : "http://localhost:2020";
    res.locals.banner_slides = await Banner_slide.find();
    res.locals.socials = ((await Site_content.find())[0] || {}).socials || [];
    res.locals.sale = ((await Site_content.find())[0] || {}).active || false;
    res.locals.cart = req.session.cart = req.session.cart || [];
    if (!req.session.paymentIntentID) return next();
    Stripe.paymentIntents.retrieve(req.session.paymentIntentID).then(pi => {
        // id used in payment completion request if true
        if (!(pi && pi.status === "succeeded")) req.session.paymentIntentID = undefined;
        if (!pi || pi.status === "succeeded") return next();
        Stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" })
                             .catch(err => console.log(err.message || err))
                             .finally(() => next());
    }).catch(err => console.log(err.message || err), next());
});

app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/product', require('./routes/product'));
app.use('/shop', require('./routes/shop'));
app.use('/shop/checkout', require('./routes/checkout'));
app.use('/shop/checkout/paypal', require('./routes/checkout-paypal'));
app.use('/lookbook', require('./routes/lookbook'));
app.use('/site/content', require('./routes/site-content'));
app.use('/ambassador', require('./routes/ambassador'));

app.get("*", (req, res) => {
    const html = `<h1>PAGE ${res.statusCode === 404 ? "IN CONSTRUCTION" : "NOT FOUND"}</h1>`;
    res.status(404).render('error', { title: "Error 404", pagename: "error", html });
});

const port = process.env.PORT || 2020;
app.listen(port, () => { console.log(`Server started${production ? "" : " on port " + port}`) });
