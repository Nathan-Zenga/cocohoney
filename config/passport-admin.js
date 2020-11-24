const { Strategy } = require('passport-local');
const { Admin } = require('../models/models');
const bcrypt = require('bcrypt');

module.exports = passport => {
    passport.use("local-login-admin", new Strategy({ usernameField: "email" }, async (email, password, done) => {
        try {
            const user = await Admin.findOne({ email });
            const match = bcrypt.compareSync(password, (user || {}).password || "");
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
            const hash = bcrypt.hashSync(password, 10);
            new Admin({ email, password: hash }).save((err, user) => done(null, user));
        } catch (err) { done(err) }
    }));

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => { Admin.findById(id, (err, user) => done(err, user)) });
}
