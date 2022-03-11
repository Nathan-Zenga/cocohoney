const { Ambassador } = require("../models/models");
const MailTransporter = require("./mail-transporter");

module.exports = async (req, res) => {
    const { token } = req.method === "POST" ? req.body : req.query;
    const amb = await Ambassador.findOne({ token });
    if (!amb) return res.status(404).send("Invalid entry");
    new MailTransporter({ req, res }, { email: amb.email }).sendMail({
        subject: "Your account is now verified.",
        message: "Hello,\n\n Your account has been verified and confirmed by " +
        "the administrator of Cocohoney Cosmetics.\n\n" +
        "Click below to activate your account:\n\n" +
        `((ACTIVATE))[${res.locals.location_origin}/ambassador/register/activate?token=${amb.token}]\n` +
        `<small>(Copy the URL if the above link is not working - ${res.locals.location_origin}/ambassador/register/activate?token=${amb.token})</small>`
    }, err => {
        if (err) return res.status(500).send(err.message);
        amb.verified = true;
        amb.save(err => res.send(`${amb.firstname} now verified. Email sent to ${amb.email} for account activation`));
    });
}
