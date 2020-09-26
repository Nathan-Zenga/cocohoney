const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/authCheck');
const { Site_content, Banner_slide } = require('../models/models');

router.post('/banner/add', isAuthed, (req, res) => {
    new Banner_slide({ text: req.body.text }).save(err => res.send("Banner text saved"));
});

router.post('/banner/edit', isAuthed, (req, res) => {
    const { id, text } = req.body;
    Banner_slide.findById(id, (err, slide) => {
        if (err || !slide) return res.status(err ? 500 : 404).send(err ? err.message : "Banner slide not found");
        if (text) slide.text = text;
    });
});

router.post('/banner/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Banner_slide.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err || !result.deletedCount) return res.status(err ? 500 : 404).send(err || "Banner text(s) not found");
        res.send("Banner text"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.post('/background-media', isAuthed, (req, res) => {
    const { image_url, image_file } = req.body;
    if (!image_url && !image_file) return res.status(400).send("No file found / specified");
    Site_content.find((err, contents) => {
        const content = !contents.length ? new Site_content() : contents[0];
        cloud.uploader.upload(image_url || image_file, { public_id: "cocohoney/site-content/site-bg" }, (err, result) => {
            if (err) return res.status(500).send(err.message);
            content.background_image = result.secure_url;
            content.save(err => res.send("Site background updated"));
        });
    })
});

module.exports = router;
