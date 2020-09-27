const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { each, forEachOf } = require('async');
const { Review } = require('../models/models');

router.get('/', (req, res) => {
    Review.find().sort({ created_at: -1 }).exec((err, reviews) => {
        res.render('customer-reviews', { title: "Reviews", pagename: "customer-reviews", reviews });
    })
});

router.get('/new', (req, res) => {
    res.render('customer-review-form', { title: "New Review", pagename: "customer-review-form" })
});

router.post('/submit', (req, res) => {
    const { author_name, headline, rating, commentry, image_file, image_url } = req.body;
    const name = req.user ? `${req.user.firstname} ${req.user.lastname}` : author_name;
    const review = new Review({ author_name: name, headline, rating, commentry, author_verified: !!req.user });
    const image_files = (Array.isArray(image_file) ? image_file : [image_file]).filter(e => e);
    const image_urls = (Array.isArray(image_url) ? image_url : [image_url]).filter(e => e);
    if (!image_url.length && !image_file.length) return review.save(() => res.send("Review submitted"));

    forEachOf([...image_files, ...image_urls ], (image, i, cb) => {
        const public_id = (`cocohoney/reviews/images/${review.id}-${i}`).replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image, { public_id }, (err, result) => {
            if (err) return cb(err.message);
            review.image = { p_id: result.public_id, url: result.secure_url };
            cb();
        });
    }, err => {
        if (err) return res.status(500).send(err.message);
        review.save(() => res.send("Review submitted"));
    })
});

router.post('/update', (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const { id, author_name, headline, rating, commentry } = req.body;
    Review.findById(id, (err, review) => {
        if (author_name) review.author_name = author_name;
        if (headline) review.headline = headline;
        if (rating) review.rating = rating;
        if (commentry) review.commentry = commentry;
        review.save(err => {
            if (err) return res.status(400).send(err.message);
            res.send("Review submitted");
        })
    })
});

router.post('/delete', (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Review.find({_id : { $in: ids }}, (err, reviews) => {
        if (err) return res.status(500).send(err.message);
        if (!reviews.length) return res.status(404).send("No reviews found");
        each(reviews, (item, cb) => {
            Review.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err ? err.message : "Product(s) not found");
                cloud.api.delete_resources_by_prefix(item.id, () => cb());
            })
        }, err => {
            if (!err) return res.send("Product"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err.message === "Product(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? "Error occurred" : "Product(s) not found");
        })
    });
});

module.exports = router;
