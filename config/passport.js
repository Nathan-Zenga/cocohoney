const { Strategy } = require('passport-local');
const { Ambassador, Member, Admin } = require('../models/models');
const bcrypt = require('bcrypt');

module.exports = passport => {
    passport.use("local-login-ambassador", new Strategy({ usernameField: "email" }, async (email, password, done) => {
        try {
            const user = await Ambassador.findOne({ email });
            const match = await bcrypt.compare(password, (user || {}).password || "");
            if (!user) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
            if (!match) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
            done(null, user);
        } catch (err) { done(err) }
    }));

    passport.use("local-login-customer", new Strategy({ usernameField: "email" }, async (email, password, done) => {
        try {
            const user = await Member.findOne({ email });
            const match = await bcrypt.compare(password, (user || {}).password || "");
            if (!user) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
            if (!match) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
            done(null, user);
        } catch (err) { done(err) }
    }));

    passport.use("local-login-admin", new Strategy({ usernameField: "email" }, async (email, password, done) => {
        try {
            const user = await Admin.findOne({ email });
            const match = await bcrypt.compare(password, (user || {}).password || "");
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
            const user = await new Admin({ email, password: hash }).save();
            done(null, user);
        } catch (err) { done(err) }
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await Ambassador.findById(id) || await Member.findById(id) || await Admin.findById(id);
            done(null, user);
        } catch (err) { done(err) }
    });
}
