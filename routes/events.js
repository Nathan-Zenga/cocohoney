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
    const { title, date, hour, minute, info, ttbc, price, stock_qty, image_url, image_file } = req.body;
    const d = new Date(date); d.setHours(hour, minute, 0, 0);
    if (!d.getDate()) return res.status(400).send("Invalid date");
    const event = new Event({ title, date: d, ttbc: !!ttbc, info, price, stock_qty });
    try {
        if (!image_url && !image_file) { await event.save(); return res.send("Event saved and posted") }
        const public_id = `cocohoney/event/flyer/${event.title}-${event.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id });
        event.image = { p_id: result.public_id, url: result.secure_url };
        await event.save(); res.send("Event saved and posted");
    } catch(err) { res.status(err.http_code || 400).send(err.message) }
});

router.post('/edit', isAuthed, async (req, res) => {
    const { id, title, date, hour, minute, ttbc, info, price, stock_qty, image_url, image_file } = req.body;
    try {
        const event = await Event.findById(id);
        if (!event) return res.status(404).send("Event not found");
        const p_id_prev = event.image.p_id;
        const d = new Date(date || 0);
        event.ttbc = !!ttbc;

        if (title) event.title = title;
        if (date) event.date.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        if (hour) event.date.setHours(hour);
        if (minute) event.date.setMinutes(minute);
        if (info) event.info = info;
        if (price) event.price = price;
        if (stock_qty) event.stock_qty = stock_qty;
        if (date || minute || hour) { event.markModified("date"); if (!event.date.getDate()) return res.status(400).send("Invalid date") }

        if (!image_url && !image_file) { await event.save(); return res.send("Event details updated") }
        await cloud.api.delete_resources([p_id_prev]);
        const public_id = `cocohoney/event/flyer/${event.title}-${event.id}`.replace(/[ ?&#\\%<>]/g, "_");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id });
        event.image = { p_id: result.public_id, url: result.secure_url };
        await event.save(); res.send("Event details updated")
    } catch(err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/remove', isAuthed, async (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    try {
        const events = await Event.find({_id : { $in: ids }});
        if (!events.length) return res.status(404).send("No event post found");
        if (ids.length > events.length) return res.status(404).send("One or more event posts not found");
        await Promise.allSettled(events.map(e => cloud.api.delete_resources([e.image.p_id])));
        await Event.deleteMany({ _id: { $in: events.map(e => e.id) } });
        res.send("Event post"+ (ids.length > 1 ? "s" : "") +" deleted successfully");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
