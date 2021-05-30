const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { each, forEachOf } = require('async');
const { Review } = require('../models/models');

router.get('/', async (req, res) => {
    const reviews = await Review.find().sort({ created_at: -1 }).exec();
    res.render('customer-reviews', { title: "Reviews", pagename: "customer-reviews", reviews });
});

router.post('/submit', (req, res) => {
    const { author_name, headline, rating, commentry, image_file, image_url } = req.body;
    const name = req.user ? `${req.user.firstname} ${req.user.lastname}` : author_name;
    const review = new Review({ author_name: name, headline, rating, commentry, author_verified: req.isAuthenticated() });
    const image_files = (Array.isArray(image_file) ? image_file : [image_file]).filter(e => e);
    const image_urls = (Array.isArray(image_url) ? image_url : [image_url]).filter(e => e);
    const images = [...image_files, ...image_urls ];
    if (!images.length) return review.save(err => res.status(err ? 500 : 200).send(err ? err.message : "Review submitted"));

    forEachOf(images, (image, i, cb) => {
        const public_id = `cocohoney/reviews/images/${review.id}-${i}`.replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image, { public_id }, (err, result) => {
            if (err) return cb(err);
            review.images.push({ p_id: result.public_id, url: result.secure_url });
            cb();
        });
    }, err => {
        if (err) return res.status(err.http_code || 500).send(err.message);
        review.save(() => res.send("Review submitted"));
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
    const { id } = req.body;
    try {
        const review = await Review.findById(id);
        if (!review) return res.status(404).send("Review not found");
        await cloud.api.delete_resources_by_prefix(review.id);
        await Review.findByIdAndDelete(id);
        res.send("Review deleted");
    } catch (err) { res.status(400).send(err.message) }
});

module.exports = router;
