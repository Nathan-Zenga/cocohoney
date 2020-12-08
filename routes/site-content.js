const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { Banner_slide, Overview_image } = require('../models/models');
const { forEachOf, each } = require('async');

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
        if (err || !result.deletedCount) return res.status(err ? 500 : 404).send(err || "Banner text(s) not found");
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
            overview_img.save(err => { if (err) return cb(err); cb() });
        });
    }, err => {
        if (err) return res.status(err.http_code || 500).send(err.message);
        res.send("Overview images(s) saved");
    })
});

router.post('/overview-images/edit', isAuthed, (req, res) => {
    const { id, image_file, image_url } = req.body;
    if (!image_file && !image_url) return res.status(400).send("No image uploaded");
    Overview_image.findById(id, (err, image) => {
        if (err) return res.status(500).send(err.message);
        if (!image) return res.status(404).send("Image not found");
        cloud.uploader.upload(image_url || image_file, { public_id: image.p_id, resource_type: "image" }, (err, result) => {
            if (err) return res.status(err.http_code).send(err.message);
            image.p_id = result.public_id;
            image.url = result.secure_url;
            image.save(() => {
                if (err) return res.status(500).send(err.message);
                res.send("Overview image updated / replaced successfully")
            });
        });
    })
});

router.post('/overview-images/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Overview_image.find({_id : { $in: ids }}, (err, images) => {
        if (err) return res.status(500).send(err.message);
        if (!images.length) return res.status(404).send("No images found");
        each(images, (item, cb) => {
            Overview_image.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err || "Image(s) not found");
                cloud.api.delete_resources([item.p_id], () => cb());
            })
        }, err => {
            if (!err) return res.send("Image"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err.message === "Image(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? "Error occurred" : "Product(s) not found");
        })
    });
});

module.exports = router;
