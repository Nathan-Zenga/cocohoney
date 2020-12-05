const router = require('express').Router();
const isAuthed = require('../modules/auth-check-admin');
const { Event } = require('../models/models');

router.get('/', async (req, res) => {
    const events = await Event.find().sort({ date: -1 }).exec();
    res.render('events', { title: "Events", pagename: "events", events })
});

router.post('/post', isAuthed, (req, res) => {
    const { title, date, info, link } = req.body;
    new Event({ title, date, info, link }).save(err => res.send("Event saved and posted"));
});

router.post('/edit', isAuthed, (req, res) => {
    const { id, title, date, info, link } = req.body;
    Event.findById(id, (err, event) => {
        if (err) return res.status(500).send(err.message);
        if (title) event.title = title;
        if (date) event.date = date;
        if (info) event.info = info;
        if (link) event.link = link;
        event.save(err => res.send("Event details updated"));
    });
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Event.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Event(s) not found");
        res.send("Event"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
