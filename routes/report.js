const router = require('express').Router();
const { each } = require('async');
const MailingListMailTransporter = require('../modules/MailingListMailTransporter');
const { Discount_code, Ambassador } = require('../models/models');

router.post("/submit", async (req, res) => {
    const items = [];
    const ambassadors = await Ambassador.find();
    each(ambassadors, async (amb, cb) => {
        const dc_doc = await Discount_code.findOne({ code: amb.discount_code });
        const ambassador = amb.firstname+" "+amb.lastname;
        const total_sales = dc_doc ? dc_doc.orders_applied.length : 0;
        const code = dc_doc ? dc_doc.code : { code: "No code" };
        items.push({ ambassador, code, total_sales });
        cb();
    }, err => {
        if (err) return res.status(500).send(err.message);
        const current_date = new Date().toDateString();
        const mail_transporter = new MailingListMailTransporter({ req, res });
        const summary = items.map(item => `<b>${item.mbassador}</b> (${item.code}): ${item.total_sales} orders sold`);
        mail_transporter.setRecipient({ email: req.session.admin_email }).sendMail({
            subject: `Ambassador Sales Report - ${ current_date }`,
            message: "Below is a summary of ambassadors' total sales so far, " +
            `as of ${ current_date }:\n\n- ${ summary.join("\n- ") }`
        }, err => {
            if (err) return res.status(500).send(err.message || err);
            res.send("Email sent successfully - Ambassador Sales Report");
        })
    })
});

module.exports = router;
