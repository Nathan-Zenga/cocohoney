const router = require('express').Router();
const { each } = require('async');
const MailTransporter = require('../modules/mail-transporter');
const { Discount_code, Ambassador, Order } = require('../models/models');

router.post("/submit", async (req, res) => {
    const { month: m, year: y } = req.body;
    const month = parseInt(m);
    const year = parseInt(y);
    const items = [];
    const ambassadors = await Ambassador.find().sort({ firstname: 1 });
    const discount_codes = await Discount_code.find();
    try {
        await each(ambassadors, (amb, cb) => {
            const ambassador = `${amb.firstname} ${amb.lastname}`;
            const dc_doc = discount_codes.find(dc => dc.code === amb.discount_code);
            Order.find({ _id: { $in: dc_doc?.orders_applied || [] } }, (err, orders) => {
                const orders_this_month = orders.filter(o => o.created_at.getMonth() === month && o.created_at.getFullYear() === year);
                items.push({ ambassador, code: dc_doc?.code || "No code", total_sales: orders_this_month.length });
                cb();
            });
        });
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const summary = items.map(item => `<b>${item.ambassador}</b> (${item.code}):\n\t${item.total_sales} order${item.total_sales > 1 ? "s" : ""} sold`);
        const subject = `Ambassador Sales Report - ${ months[month] } ${ year }`;
        const message = `Below is a summary of each ambassador's current total sales this month:\n\n- ${ summary.join("\n\n- ") }`;
        await new MailTransporter().setRecipient({ email: process.env.CHC_EMAIL }).sendMail({ subject, message });
        res.send("Ambassador Sales Report emailed to you successfully");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
