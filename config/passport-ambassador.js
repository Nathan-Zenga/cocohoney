const { Strategy } = require('passport-local');
const { Ambassador } = require('../models/models');
const bcrypt = require('bcrypt');

module.exports = passport => {
    passport.use("local-login-ambassador", new Strategy({ usernameField: "email" }, (email, password, done) => {
        Ambassador.findOne({ email }, (err, user) => {
            if (err) return done(err);
            if (!user) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
            bcrypt.compare(password, user.password, (err, match) => {
                if (err) return done(err);
                if (!match) return done(null, null, { message: "Credentials are invalid, or this account is not registered" });
                done(null, user);
            });
        });
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => { Ambassador.findById(id, (err, user) => done(err, user)) });
}
