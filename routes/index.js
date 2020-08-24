const router = require('express').Router();

router.get('/', (req, res) => {
    res.render('index', { title: null, pagename: "home" })
});

router.get('/about', (req, res) => {
    res.render('about', { title: "About", pagename: "about" })
});

module.exports = router;
