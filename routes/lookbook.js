const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { each } = require('async');
const { Lookbook_media } = require('../models/models');

router.get('/gallery', async (req, res) => {
    const images = await Lookbook_media.find({ media_type: "image" }).sort({ position: 1 }).exec();
    res.render('lookbook-gallery', { title: "Lookbook (Gallery)", pagename: "lookbook-gallery", images })
});

router.get('/tutorial', async (req, res) => {
    const videos = await Lookbook_media.find({ media_type: "video", tutorial: true });
    res.render('lookbook-tutorial', { title: "Lookbook (Tutorial)", pagename: "lookbook-tutorial", videos })
});

router.post('/gallery/add', isAuthed, (req, res) => {
    const { image_file, image_url } = req.body;
    const image_files = (Array.isArray(image_file) ? image_file : [image_file]).filter(e => e);
    const image_urls = (Array.isArray(image_url) ? image_url : [image_url]).filter(e => e);
    const images = [...image_files, ...image_urls];
    const saved_p_ids = [];
    if (!images.length) return res.status(400).send("No images / videos uploaded");
    each(images, (img, cb) => {
        const new_media = new Lookbook_media();
        const public_id = "cocohoney/lookbook-gallery/IMG_" + new_media.id;
        cloud.uploader.upload(img.trim(), { public_id, resource_type: "image" }, (err, result) => {
            if (err) return cb(err);
            saved_p_ids.push(public_id);
            const { secure_url, resource_type, width, height } = result;
            new_media.p_id = public_id;
            new_media.url = secure_url;
            new_media.media_type = resource_type;
            new_media.orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
            new_media.save(err => err ? cb(err) : cb());
        });
    }, err => {
        if (!err) return res.send("Lookbook images(s) saved");
        cloud.api.delete_resources(saved_p_ids, () => res.status(err.http_code || 500).send(err.message));
    })
});

router.post('/tutorial/add', isAuthed, (req, res) => {
    const { video_file, video_url } = req.body;
    const video_files = (video_file instanceof Array ? video_file : [video_file]).filter(e => e);
    const video_urls = (video_url instanceof Array ? video_url : [video_url]).filter(e => e);
    const videos = [...video_files, ...video_urls];
    const saved_p_ids = [];
    if (!videos.length) return res.status(400).send("No images / videos uploaded");
    each(videos, (vid, cb) => {
        const new_media = new Lookbook_media();
        const public_id = "cocohoney/lookbook-tutorial/VID_" + new_media.id;
        cloud.uploader.upload(vid.trim(), { public_id, resource_type: "video" }, (err, result) => {
            if (err) return cb(err);
            saved_p_ids.push(public_id);
            const { secure_url, resource_type, width, height } = result;
            new_media.p_id = public_id;
            new_media.url = secure_url;
            new_media.media_type = resource_type;
            new_media.orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
            new_media.tutorial = true;
            new_media.save(err => { err ? cb(err) : cb() });
        });
    }, err => {
        if (!err) return res.send("Lookbook tutorial video(s) saved");
        cloud.api.delete_resources(saved_p_ids, () => res.status(err.http_code || 500).send(err.message));
    })
});

router.post('/reorder', isAuthed, async (req, res) => {
    const ids = (Array.isArray(req.body.id) ? req.body.id : [req.body.id]).filter(e => e);
    try {
        await Promise.all(ids.map((_id, i) => Lookbook_media.findOneAndUpdate({ _id }, { $set: { position: i } })));
        res.send("Lookbook images / videos successfully reordered");
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/remove', isAuthed, async (req, res) => {
    const ids = Object.values(req.body);
    const plural = ids.length > 1 ? "s" : "";
    if (!ids.length) return res.status(400).send("Nothing selected");
    try {
        const media = await Lookbook_media.find({_id : { $in: ids }});
        if (!media.length) return res.status(404).send(`No image${plural}/video${plural} found`);
        if (ids.length > media.length) return res.status(404).send(`One or more image${plural}/video${plural} not found`);
        await Promise.allSettled(media.map(img => cloud.api.delete_resources([img.p_id])));
        await Lookbook_media.deleteMany({ _id: { $in: media.map(m => m.id) } });
        res.send(`Image${plural}/video${plural} deleted successfully`);
    } catch (err) { return res.status(500).send(err.message) }
});

module.exports = router;
