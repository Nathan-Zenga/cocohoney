const { Ambassador } = require("../models/models");
const MailingListMailTransporter = require("./MailingListMailTransporter");

module.exports = (req, res) => {
    const { token } = req.method === "POST" ? req.body : req.query;
    Ambassador.findOne({ token }, (err, amb) => {
        if (err) return res.status(500).send(err.message);
        if (!amb) return res.status(404).send("Invalid entry");
        new MailingListMailTransporter({ req, res }, { email: amb.email }).sendMail({
            subject: "Your account is now verified.",
            message: "Hello,\n\n Your account has been verified and confirmed by " +
            "the administrator of Cocohoney Cosmetics.\n\n" +
            "Please click the following link below to activate your account:\n" +
            `${res.locals.location_origin}/ambassador/register/activate?token=${amb.token}`
        }, err => {
            if (err) return res.status(500).send(err.message);
            amb.verified = true;
            amb.save(err => res.send(`${amb.firstname} now verified. Email sent to ${amb.email} for account activation`));
        });
    })
}
