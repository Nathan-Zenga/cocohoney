const { Strategy } = require('passport-local');
const { Admin } = require('../models/models');
const bcrypt = require('bcrypt');

module.exports = passport => {
    passport.use("local-login", new Strategy((email, password, done) => {
        Admin.findOne({ email }, (err, user) => {
            if (err) return done(err);
            if (!user) return done(null, "to_activate", { message: "Verification email sent" });
            bcrypt.compare(password, user.password, (err, match) => {
                if (err) return done(err);
                if (!match) return done(null, null, { message: "Invalid password" });
                done(null, user);
            });
        });
    }));

    passport.use("local-register", new Strategy({ passReqToCallback: true }, (req, email, password, done) => {
        if (password !== req.body.password_confirm) return done(null, null, { message: "Passwords don't match" });
        Admin.findOne({ password: req.params.token, tokenExpiryDate: { $gte: Date.now() } }, (err, found) => {
            if (!found) return done(null, null, { message: "Cannot activate account: token expired / not valid" });
            Admin.findOne({ email }, (err, found) => {
                if (found) return done(null, null, { message: "An admin is already registered" });
                bcrypt.hash(password, 10, (err, hash) => {
                    new Admin({ email, password: hash }).save((err, user) => done(null, user));
                });
            });
        });
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => { Admin.findById(id, (err, user) => done(err, user)) });
}
