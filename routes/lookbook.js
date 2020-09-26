const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/authCheck');
const { each } = require('async');
const { Lookbook_media } = require('../models/models');

router.get('/gallery', (req, res) => {
    Lookbook_media.find({ media_type: "image" }, (err, images) => {
        res.render('lookbook-gallery', { title: "Lookbook (Gallery)", pagename: "lookbook-gallery" })
    })
});

router.get('/tutorial', (req, res) => {
    Lookbook_media.find({ media_type: "video", is_tutorial: true }, (err, video) => {
        res.render('lookbook-tutorial', { title: "Lookbook (tutorial)", pagename: "lookbook-tutorial" })
    })
});

router.post('/gllery/add', (req, res) => {
    const { image_file, image_url } = req.body;
    if (!image_file && !image_url) return res.send("No image / video uploaded");
    const image_files = (image_file_name instanceof Array ? image_file_name : [image_file_name]).filter(e => e);
    const image_urls = (image_url_name instanceof Array ? image_url_name : [image_url_name]).filter(e => e);
    each([...image_files, ...image_urls], (file, cb) => {
        const new_media = new Lookbook_media();
        const public_id = "cocohoney/lookbook-gallery/media_" + new_media.id;
        cloud.uploader.upload(file, { public_id }, (err, result) => {
            if (err) return cb(err.message);
            const { secure_url, resource_type, width, height } = result;
            const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
            new Lookbook_media({ p_id: public_id, url: secure_url, media_type: resource_type, orientation }).save(err => {
                if (err) return cb(err.message); cb();
            });
        });
    }, err => {
        if (err) return res.status(500).send(err.message);
        saved.save(() => { res.send("Product saved in stock") });
    })
});

module.exports = router;
