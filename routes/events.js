const router = require('express').Router();

router.get('/', async (req, res) => {
    res.render('events', { title: "Events", pagename: "events" })
});

module.exports = router;
