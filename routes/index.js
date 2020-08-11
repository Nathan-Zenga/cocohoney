const router = require('express').Router();

router.get('/', (req, res) => {
    res.render('index', { title: null })
});

module.exports = router;
