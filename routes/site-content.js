const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { Banner_slide, Overview_image } = require('../models/models');
const { forEachOf } = require('async');

router.post('/banner/add', isAuthed, (req, res) => {
    Banner_slide.create({ text: req.body.text }, err => res.send("Banner text saved"));
});

router.post('/banner/edit', isAuthed, (req, res) => {
    const { id, text } = req.body;
    Banner_slide.findById(id, (err, slide) => {
        if (err || !slide) return res.status(err ? 500 : 404).send(err ? err.message : "Banner slide not found");
        if (text) slide.text = text;
        slide.save(err => res.send("Banner saved"));
    });
});

router.post('/banner/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Banner_slide.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err.message);
        if (!result.deletedCount) return res.status(404).send("Banner text(s) not found");
        res.send("Banner text"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

router.post('/overview-images/upload', isAuthed, async (req, res) => {
    const { image_url, image_file } = req.body;
    const image_files = (image_file instanceof Array ? image_file : [image_file]).filter(e => e);
    const image_urls = (image_url instanceof Array ? image_url : [image_url]).filter(e => e);
    if (!image_files.length && !image_urls.length) return res.status(400).send("No images uploaded");
    const arr = await Overview_image.find();
    forEachOf([...image_files, ...image_urls], (file, i, cb) => {
        const overview_img = new Overview_image();
        const public_id = "cocohoney/site-content/pages/index/overview/" + overview_img.id;
        cloud.uploader.upload(file, { public_id, resource_type: "image" }, (err, result) => {
            if (err) return cb(err);
            overview_img.p_id = result.public_id;
            overview_img.url = result.secure_url;
            overview_img.position = arr.length + (i+1);
            overview_img.save().then(_ => cb()).catch(err => cb(err));
        });
    }, err => {
        if (err) return res.status(err.http_code || 500).send(err.message);
        res.send("Overview images(s) saved");
    })
});

router.post('/overview-images/edit', isAuthed, async (req, res) => {
    const { id, image_file, image_url } = req.body;
    if (!image_file && !image_url) return res.status(400).send("No image uploaded");
    try {
        const image = await Overview_image.findById(id);
        if (!image) return res.status(404).send("Image not found");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id: image.p_id, resource_type: "image" });
        image.p_id = result.public_id;
        image.url = result.secure_url;
        await image.save(); res.send("Overview image updated / replaced successfully")
    } catch (err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/overview-images/reorder', isAuthed, (req, res) => {
    const ids = (Array.isArray(req.body.id) ? req.body.id : [req.body.id]).filter(e => e);
    forEachOf(ids, (_id, position, cb) => {
        Overview_image.findOneAndUpdate({ _id }, { $set: { position } }, err => { cb() })
    }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Overview images successfully reordered");
    })
});

router.post('/overview-images/remove', isAuthed, async (req, res) => {
    const ids = (Array.isArray(req.body.id) ? req.body.id : [req.body.id]).filter(e => e);
    if (!ids.length) return res.status(400).send("Nothing selected");
    try {
        const images = await Overview_image.find({_id : { $in: ids }});
        if (!images.length) return res.status(404).send("No images found");
        if (ids.length > images.length) return res.status(404).send("One or more images not found");
        await Promise.allSettled(images.map(img => cloud.api.delete_resources([img.p_id])));
        await Overview_image.deleteMany({ _id: { $in: images.map(img => img.id) } });
        res.send("Image"+ (ids.length > 1 ? "s" : "") +" deleted successfully");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
