const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
// const mongoose = require('mongoose');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const { CHCDB, NODE_ENV } = process.env;
const production = NODE_ENV === "production";

// mongoose.connect(CHCDB, { useNewUrlParser: true, useUnifiedTopology: true, autoIndex: false });
// mongoose.connection.once('open', () => { console.log("Connected to DB") });

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
    cookie: { secure: true },
    store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 12 })
}));

app.use((req, res, next) => { // global variables
    res.locals.location_origin = `https://${req.hostname}`;
    next();
});

app.use('/', require('./routes/index'));
app.use('/product', require('./routes/product'));
app.use('/shop', require('./routes/shop'));

app.get("*", (req, res) => {
    const html = `<h1>PAGE ${res.statusCode === 404 ? "IN CONSTRUCTION" : "NOT FOUND"}</h1>`;
    res.status(404).render('error', { title: "Error 404", pagename: "error", html });
});

const port = process.env.PORT || 2020;
app.listen(port, () => { console.log(`Server started${production ? "" : " on port " + port}`) });
