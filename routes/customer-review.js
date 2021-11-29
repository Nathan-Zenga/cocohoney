const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { default: axios } = require('axios');
const { forEachOf } = require('async');
const { Review } = require('../models/models');
const { RECAPTCHA_SITE_KEY: recaptcha_site_key, RECAPTCHA_SECRET_KEY } = process.env;

router.get('/', async (req, res) => {
    const reviews = await Review.find().sort({ created_at: -1 }).exec();
    res.render('customer-reviews', { title: "Reviews", pagename: "customer-reviews", reviews, recaptcha_site_key });
});

router.post('/submit', async (req, res) => {
    const { author_name, headline, rating, commentry, image_file, image_url, "g-recaptcha-response": captcha } = req.body;
    const name = req.user ? `${req.user.firstname} ${req.user.lastname}` : author_name;
    const review = new Review({ author_name: name, headline, rating, commentry, author_verified: req.isAuthenticated() });
    const image_files = (Array.isArray(image_file) ? image_file : [image_file]).filter(e => e);
    const image_urls = (Array.isArray(image_url) ? image_url : [image_url]).filter(e => e);
    const images = [...image_files, ...image_urls];
    const saved_p_ids = [];

    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: captcha, remoteip: req.socket.remoteAddress });
    const verifyURL = `https://google.com/recaptcha/api/siteverify?${params.toString()}`;
    const { data: result } = await axios.get(verifyURL).catch(e => e);
    if (!result.success) return res.status(400).send("Failed CAPTCHA verification");

    if (!images.length) return review.save(e => res.status(e ? 500 : 200).send(e ? e.message : "Review submitted"));
    forEachOf(images, (image, i, cb) => {
        const public_id = `cocohoney/reviews/images/${review.id}-${i}`.replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image, { public_id }, (err, result) => {
            if (err) return cb(err);
            saved_p_ids.push(result.public_id);
            review.images.push({ p_id: result.public_id, url: result.secure_url });
            cb();
        });
    }, err => {
        if (!err) return review.save(e => res.status(e ? 500 : 200).send(e ? e.message : "Review submitted"));
        cloud.api.delete_resources(saved_p_ids, () => res.status(err.http_code || 500).send(err.message));
    })
});

router.post('/update', async (req, res) => {
    if (req.isUnauthenticated()) return res.sendStatus(401);
    const { id, author_name, headline, rating, commentry } = req.body;
    try {
        const review = await Review.findById(id);
        if (author_name) review.author_name = author_name;
        if (headline) review.headline = headline;
        if (rating) review.rating = rating;
        if (commentry) review.commentry = commentry;
        await review.save(); res.send("Review submitted");
    } catch (err) { res.status(400).send(err.message) }
});

router.post('/delete', async (req, res) => {
    if (!res.locals.is_admin) return res.sendStatus(401);
    try {
        const review = await Review.findById(req.body.id);
        if (!review) return res.status(404).send("Review not found");
        await cloud.api.delete_resources_by_prefix(review.id);
        await Review.findByIdAndDelete(review.id);
        res.send("Review deleted");
    } catch (err) { res.status(err.http_code || 400).send(err.message) }
});

module.exports = router;
