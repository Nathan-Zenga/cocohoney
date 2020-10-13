const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { each } = require('async');
const { Lookbook_media } = require('../models/models');

router.get('/gallery', (req, res) => {
    Lookbook_media.find({ media_type: "image" }).sort({ position: 1 }).exec((err, images) => {
        res.render('lookbook-gallery', { title: "Lookbook (Gallery)", pagename: "lookbook-gallery", images })
    })
});

router.get('/tutorial', (req, res) => {
    Lookbook_media.find({ media_type: "video", tutorial: true }, (err, videos) => {
        res.render('lookbook-tutorial', { title: "Lookbook (Tutorial)", pagename: "lookbook-tutorial", videos })
    })
});

router.post('/gallery/add', isAuthed, (req, res) => {
    const { image_file, image_url } = req.body;
    const image_files = (Array.isArray(image_file) ? image_file : [image_file]).filter(e => e);
    const image_urls = (Array.isArray(image_url) ? image_url : [image_url]).filter(e => e);
    const images = [...image_files, ...image_urls];
    if (!images.length) return res.status(400).send("No images / videos uploaded");
    each(images, (img, cb) => {
        const new_media = new Lookbook_media();
        const public_id = "cocohoney/lookbook-gallery/IMG_" + new_media.id;
        cloud.uploader.upload(img.trim(), { public_id, resource_type: "image" }, (err, result) => {
            if (err) return cb(err.message);
            const { secure_url, resource_type, width, height } = result;
            new_media.p_id = public_id;
            new_media.url = secure_url;
            new_media.media_type = resource_type;
            new_media.orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
            new_media.save(err => err ? cb(err.message) : cb());
        });
    }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Lookbook images(s) saved");
    })
});

router.post('/tutorial/add', isAuthed, (req, res) => {
    const { video_file, video_url } = req.body;
    const video_files = (video_file instanceof Array ? video_file : [video_file]).filter(e => e);
    const video_urls = (video_url instanceof Array ? video_url : [video_url]).filter(e => e);
    const videos = [...video_files, ...video_urls];
    if (!videos.length) return res.status(400).send("No images / videos uploaded");
    each(videos, (vid, cb) => {
        const new_media = new Lookbook_media();
        const public_id = "cocohoney/lookbook-tutorial/VID_" + new_media.id;
        cloud.uploader.upload(vid.trim(), { public_id, resource_type: "video" }, (err, result) => {
            if (err) return cb(err.message);
            const { secure_url, resource_type, width, height } = result;
            new_media.p_id = public_id;
            new_media.url = secure_url;
            new_media.media_type = resource_type;
            new_media.orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
            new_media.tutorial = true;
            new_media.save(err => { if (err) return cb(err.message); cb() });
        });
    }, err => {
        if (err) return res.status(500).send(err.message);
        res.send("Lookbook tutorial video(s) saved");
    })
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    const plural = ids.length > 1 ? "s" : "";
    if (!ids.length) return res.status(400).send("Nothing selected");
    Lookbook_media.find({_id : { $in: ids }}, (err, media) => {
        if (err) return res.status(500).send(err.message);
        if (!media.length) return res.status(404).send("No media found");
        each(media, (img, cb) => {
            Lookbook_media.findByIdAndDelete(img.id, err => {
                if (err) return cb(err.message || err);
                cloud.api.delete_resources([img.p_id], () => cb());
            })
        }, err => {
            if (err) return res.status(500).send(err.message);
            res.send(`Image${plural}/video${plural} deleted successfully`);
        })
    });
});

module.exports = router;
