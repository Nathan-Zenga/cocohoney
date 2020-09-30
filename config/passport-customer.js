const { Strategy } = require('passport-local');
const { Member } = require('../models/models');
const bcrypt = require('bcrypt');

module.exports = passport => {
    passport.use("local-login-customer", new Strategy((email, password, done) => {
        Member.findOne({ email }, (err, user) => {
            if (err) return done(err);
            if (!user) return done(null, null, { message: "Invalid credentials" });
            bcrypt.compare(password, user.password, (err, match) => {
                if (err) return done(err);
                if (!match) return done(null, null, { message: "Invalid credentials" });
                done(null, user);
            });
        });
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => { Member.findById(id, (err, user) => done(err, user)) });
}
