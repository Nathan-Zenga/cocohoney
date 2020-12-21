const { Strategy } = require('passport-local');
const { Ambassador, Member, Admin, Subscriber } = require('../models/models');
const bcrypt = require('bcrypt');
const passport = require('passport');

passport.use("local-login-ambassador", new Strategy({ usernameField: "email" }, async (email, password, done) => {
    try {
        const user = await Ambassador.findOne({ email });
        const match = await bcrypt.compare(password, user?.password || "");
        if (!user || !match) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
        done(null, user);
    } catch (err) { done(err) }
}));

passport.use("local-login-customer", new Strategy({ usernameField: "email" }, async (email, password, done) => {
    try {
        const user = await Member.findOne({ email });
        const match = await bcrypt.compare(password, user?.password || "");
        if (!user || !match) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
        done(null, user);
    } catch (err) { done(err) }
}));

passport.use("local-login-subscriber", new Strategy({ usernameField: "email", passReqToCallback: true }, async (req, email, password, done) => {
    try {
        const { sub_id } = req.body;
        const user = await Subscriber.findOne({ sub_id, "customer.email": email, access_token_expiry_date: { $gte: Date.now() } });
        const match = await bcrypt.compare(password, (user || {}).access_token || "");
        if (!user || !match) return done(null, null, { message: "Credentials are invalid, or the password is expired (reload this page to receive a new temporary password via email, if this is case)" });
        done(null, user);
    } catch (err) { done(err) }
}));

passport.use("local-login-admin", new Strategy({ usernameField: "email" }, async (email, password, done) => {
    try {
        const user = await Admin.findOne({ email });
        const match = await bcrypt.compare(password, user?.password || "");
        if (!user) return done(null, "to_activate", { message: "Verification email sent" });
        if (!match) return done(null, null, { message: "Invalid password" });
        done(null, user);
    } catch (err) { done(err) }
}));

passport.use("local-register-admin", new Strategy({ passReqToCallback: true }, async (req, email, password, done) => {
    try {
        if (password !== req.body.password_confirm) return done(null, null, { message: "Passwords don't match" });
        const applicant = await Admin.findOne({ password: req.params.token, token_expiry_date: { $gte: Date.now() } });
        const existing = await Admin.findOne({ email });
        if (!applicant) return done(null, null, { message: "Cannot activate account: expired / invalid token" });
        if (existing) return done(null, null, { message: "An admin is already registered" });
        const hash = await bcrypt.hash(password, 10);
        const user = await Admin.create({ email, password: hash });
        done(null, user);
    } catch (err) { done(err) }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const queries = [Ambassador.findById(id), Member.findById(id), Admin.findById(id), Subscriber.findById(id)];
        const user = (await Promise.all(queries)).find(u => u);
        done(null, user);
    } catch (err) { done(err) }
});

module.exports = passport;
