const router = require('express').Router();
const { Subscription_plan } = require('../models/models');

router.post("/add", (req, res) => {
    const { interval, interval_count, price, info } = req.body;
    const sub = new Subscription_plan({ interval, interval_count, price, info });
    sub.save(err => {
        if (err) return res.status(500).send(err.message);
        res.send("Subscription plan saved");
    });
});

router.post("/edit", (req, res) => {
    const { id, interval, interval_count, price, info } = req.body;
    Subscription_plan.findById(id, (err, sub) => {
        if (err) return res.status(500).send(err.message);
        if (interval)       sub.interval = interval;
        if (interval_count) sub.interval_count = interval_count;
        if (price)          sub.price = price;
        if (info)           sub.info = info;
        sub.save(err => {
            if (err) return res.status(500).send(err.message);
            res.send("Subscription plan details updated");
        });
    });
});

router.post("/remove", (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Subscription_plan.deleteMany({_id : { $in: ids }}, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Subscription plan"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
