const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { Info } = require('../models/models');

router.get('/', async (req, res) => {
    const info = await Info.findOne();
    res.render('about', { title: "About", pagename: "about", info })
});

router.post('/text/edit', async (req, res) => {
    const info = await Info.findOne() || new Info();
    info.main_text = req.body.main_text;
    info.founder_text = req.body.founder_text;
    info.save(err => res.send("About page info text updated"));
});

router.post('/image/upload', async (req, res) => {
    const { image_file, image_url } = req.body;
    const info = await Info.findOne() || new Info();
    const public_id = info.image.p_id || `cocohoney/site-content/pages/about/main-image`;
    if (!image_file && !image_url) return res.status(400).send("No image selected");
    cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
        if (err) return res.status(err.http_code).send(err.message);
        info.image = { p_id: result.public_id, url: result.secure_url };
        info.save(err => res.send("About page image uploaded"));
    });
});

router.post('/image/remove', async (req, res) => {
    const info = await Info.findOne() || new Info();
    if (!info || !info.image.p_id) return res.status(400).send("No image to remove");
    cloud.api.delete_resources([info.image.p_id], err => {
        if (err) return res.status(err.statusCode).send(err.message);
        info.image = undefined;
        info.save(err => res.send("About page image removed"));
    });
});

module.exports = router;
