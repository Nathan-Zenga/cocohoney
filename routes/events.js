const router = require('express').Router();
const cloud = require('cloudinary').v2;
const countries = require("../modules/country-list");
const isAuthed = require('../modules/auth-check-admin');
const { Event } = require('../models/models');

router.get('/', async (req, res) => {
    const events = await Event.find().sort({ date: -1 }).exec();
    res.render('events', { title: "Events", pagename: "events", events, countries })
});

router.post('/post', isAuthed, async (req, res) => {
    const { title, date, info, price, stock_qty, image_url, image_file } = req.body;
    const event = new Event({ title, date, info, price, stock_qty });
    try {
        if (!image_url && !image_file) { await event.save(); return res.send("Event saved and posted") }
        const public_id = `cocohoney/event/flyer/${event.title}-${event.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = cloud.uploader.upload(image_url || image_file, { public_id });
        event.image = { p_id: result.public_id, url: result.secure_url };
        await event.save(); res.send("Event saved and posted");
    } catch(err) { res.status(err.http_code || 400).send(err.message) }
});

router.post('/edit', isAuthed, (req, res) => {
    const { id, title, date, info, price, stock_qty, image_url, image_file } = req.body;
    Event.findById(id, (err, event) => {
        if (err) return res.status(500).send(err.message);
        if (!event) return res.status(404).send("Event not found");
        const p_id_prev = event.image.p_id;

        if (title) event.title = title;
        if (date) event.date = date;
        if (info) event.info = info;
        if (price) event.price = price;
        if (stock_qty) event.stock_qty = stock_qty;

        event.save((err, saved) => {
            if (err) return res.status(500).send(err.message);
            if (!image_url && !image_file) return res.send("Event details updated");
            const public_id = `cocohoney/event/flyer/${saved.title}-${saved.id}`.replace(/[ ?&#\\%<>]/g, "_");
            cloud.api.delete_resources([p_id_prev], () => {
                cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                    if (err) return res.status(err.http_code).send(err.message);
                    saved.image = { p_id: result.public_id, url: result.secure_url };
                    saved.save(() => { res.send("Event details updated") });
                });
            });
        });
    });
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Event.find({_id : { $in: ids }}, (err, events) => {
        if (err) return res.status(500).send(err.message);
        if (!events.length) return res.status(404).send("No events found");
        each(events, (item, cb) => {
            Event.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err || "Event(s) not found");
                cloud.api.delete_resources([item.image.p_id], () => cb());
            })
        }, err => {
            if (!err) return res.send("Event"+ (ids.length > 1 ? "s" : "") +" deleted successfully");
            let is404 = err === "Event(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? err.message : "Event(s) not found");
        })
    });
});

module.exports = router;
