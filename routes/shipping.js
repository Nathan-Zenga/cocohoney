const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const { Shipping_method } = require('../models/models');

router.get('/', (req, res) => {
    res.render('shipping', { title: "Shipping Information", pagename: "shipping-info" })
});

router.post('/new', (req, res) => {
    const { name, fee } = req.body;
    new Shipping_method({ name, fee }).save(err => res.send("Shipping method saved"));
});

router.post('/edit', (req, res) => {
    const { id, name, fee } = req.body;
    Shipping_method.findById(id, (err, method) => {
        if (err) return res.status(500).send(err.message);
        if (name) method.name = name;
        if (fee) method.fee = fee;
        method.save(err => res.send("Shipping method updated"));
    });
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Shipping_method.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Shipping method(s) not found");
        res.send("Shipping method"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
