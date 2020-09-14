const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SK);
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const { CHCDB, NODE_ENV } = process.env;
const { Site_content } = require("./models/models");
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
    res.locals.location_origin = `https://${req.hostname}`;
    res.locals.socials = ((await Site_content.find())[0] || {}).socials || [];
    res.locals.sale = ((await Site_content.find())[0] || {}).active || false;
    res.locals.cart = req.session.cart = req.session.cart || [];
    if (!req.session.paymentIntentID) return next();
    stripe.paymentIntents.retrieve(req.session.paymentIntentID, (err, pi) => {
        if (err) return console.log(err.message || err), next();
        // id used in payment completion request if true
        if (!(pi && pi.status === "succeeded")) req.session.paymentIntentID = undefined;
        if (!pi || pi.status === "succeeded") return next();
        stripe.paymentIntents.cancel(pi.id, { cancellation_reason: "requested_by_customer" }, err => {
            if (err) console.log(err.message || err);
            next();
        });
    });
});

app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/product', require('./routes/product'));
app.use('/shop', require('./routes/shop'));
app.use('/lookbook', require('./routes/lookbook'));
app.use('/site/content', require('./routes/site-content'));
app.use('/ambassador', require('./routes/ambassador'));

app.get("*", (req, res) => {
    const html = `<h1>PAGE ${res.statusCode === 404 ? "IN CONSTRUCTION" : "NOT FOUND"}</h1>`;
    res.status(404).render('error', { title: "Error 404", pagename: "error", html });
});

const port = process.env.PORT || 2020;
app.listen(port, () => { console.log(`Server started${production ? "" : " on port " + port}`) });
