const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { each } = require('async');
const isAuthed = require('../modules/auth-check-admin');
const { Highlights_post } = require('../models/models');

router.post('/add', isAuthed, async (req, res) => {
    const { title, text_body, link, media_lg_file, media_lg_url, media_sm_file, media_sm_url } = req.body;
    const slide = new Highlights_post({ title, text_body, link });
    const media_lg = media_lg_url || media_lg_file;
    const media_sm = media_sm_url || media_sm_file;
    const p_id_lg = "cocohoney/site-content/pages/index/highlights-media/media-lg-" + slide.id;
    const p_id_sm = "cocohoney/site-content/pages/index/highlights-media/media-sm-" + slide.id;
    try {
        if (!media_lg) throw { stat: 400, message: "Please upload the main image for this post" }
        const result1 = await cloud.uploader.upload(media_lg, { public_id: p_id_lg });
        const result2 = media_sm ? await cloud.uploader.upload(media_sm, { public_id: p_id_sm, resource_type: "auto" }) : {};
        slide.media_lg.p_id = result1.public_id;
        slide.media_lg.url = result1.secure_url;
        slide.media_lg.media_type = result1.resource_type;
        slide.media_sm.p_id = result2.public_id;
        slide.media_sm.url = result2.secure_url;
        slide.media_sm.media_type = result2.resource_type;
        await slide.save(); res.send("Saved");
    } catch(err) { res.status(err.stat || err.http_code || 500).send(err.message) }
});

router.post('/edit', isAuthed, async (req, res) => {
    const { id, title, text_body, link, media_lg_file, media_lg_url, media_sm_file, media_sm_url } = req.body;
    const media_lg = media_lg_url || media_lg_file;
    const media_sm = media_sm_url || media_sm_file;
    try {
        const slide = await Highlights_post.findById(id);
        if (!slide) return res.status(404).send("Slide not found");
        if (title)     slide.title = title
        if (text_body) slide.text_body = text_body
        if (link)      slide.link = link;

        if (!media_lg && !media_sm) return slide.save(err => res.send("Slide updated"));
        const result1 = media_lg ? await cloud.uploader.upload(media_lg, { public_id: slide.media_lg.p_id }) : null;
        const result2 = media_sm ? await cloud.uploader.upload(media_sm, { public_id: slide.media_sm.p_id }) : null;
        if (result1) slide.media_lg.p_id = result1.public_id;
        if (result1) slide.media_lg.url = result1.secure_url;
        if (result1) slide.media_lg.media_type = result1.resource_type;
        if (result2) slide.media_sm.p_id = result2.public_id;
        if (result2) slide.media_sm.url = result2.secure_url;
        if (result2) slide.media_sm.media_type = result2.resource_type;
        await slide.save(); res.send("Slide updated");
    } catch(err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Highlights_post.find({_id : { $in: ids }}, (err, posts) => {
        if (err) return res.status(500).send(err.message);
        if (!posts.length) return res.status(404).send("No posts found");
        each(posts, (post, cb) => {
            Highlights_post.findByIdAndDelete(post.id, err => {
                if (err) return cb(err);
                const opts_lg = { resource_type: post.media_lg.media_type };
                const opts_sm = post.media_sm ? { resource_type: post.media_sm.media_type } : {};
                cloud.api.delete_resources([post.media_lg.p_id], opts_lg, () => {
                    cloud.api.delete_resources([(post.media_sm || {}).p_id], opts_sm, () => cb());
                })
            })
        }, err => {
            if (err) return res.status(500).send(err.message);
            res.send(`Highlights post${ids.length > 1 ? "s" : ""} deleted successfully`);
        })
    });
});

module.exports = router;
