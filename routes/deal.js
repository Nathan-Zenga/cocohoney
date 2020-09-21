const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const { Box } = require('../models/models');

router.post('/box/add', isAuthed, (req, res) => {
    const { name, price, info, max_items } = req.body;
    new Box({ name, price, info, max_items }).save(err => res.send("Box saved"));
});

router.post('/box/edit', isAuthed, (req, res) => {
    const { id, name, price, info, max_items } = req.body;
    Box.findById(id, (err, faq) => {
        if (err) return res.status(500).send(err.message);
        if (name) faq.name = name;
        if (price) faq.price = price;
        if (info) faq.info = info;
        if (max_items) faq.max_items = max_items;
        faq.save(err => res.send("Box updated"));
    });
});

router.post('/box/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Box.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Box(s) not found");
        res.send("Box"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
