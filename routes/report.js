const router = require('express').Router();
const { each } = require('async');
const MailTransporter = require('../modules/mail-transporter');
const { Discount_code, Ambassador, Order } = require('../models/models');

router.post("/submit", async (req, res) => {
    const items = [];
    const ambassadors = await Ambassador.find().sort({ firstname: 1 });
    const discount_codes = await Discount_code.find();
    each(ambassadors, (amb, cb) => {
        const ambassador = `${amb.firstname} ${amb.lastname}`;
        const dc_doc = discount_codes.find(dc => dc.code === amb.discount_code);
        const { code, orders_applied } = dc_doc || {};
        Order.find({ _id: { $in: orders_applied || [] } }, (err, orders) => {
            const orders_this_month = orders.filter(o => o.created_at.getMonth() === new Date().getMonth());
            const total_sales = orders_this_month.length;
            items.push({ ambassador, code: code || "No code", total_sales });
            cb();
        });
    }, err => {
        if (err) return res.status(500).send(err.message);
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const current_month = months[new Date().getMonth()];
        const mail_transporter = new MailTransporter({ req, res });
        const summary = items.map(item => `<b>${item.ambassador}</b> (${item.code}):\n\t${item.total_sales} order${item.total_sales > 1 ? "s" : ""} sold`);
        mail_transporter.setRecipient({ email: req.session.admin_email }).sendMail({
            subject: `Ambassador Sales Report - ${ current_month } ${ new Date().getFullYear() }`,
            message: "Below is a summary of each ambassador's current total sales this month:\n\n" +
            `- ${ summary.join("\n\n- ") }`
        }, err => {
            if (err) return res.status(500).send(err.message || err);
            res.send("Ambassador Sales Report emailed to you successfully");
        })
    })
});

module.exports = router;
