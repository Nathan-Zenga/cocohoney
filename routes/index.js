const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
const { each } = require('async');
const { Lookbook_media } = require('../models/models');

router.get('/', (req, res) => {
    res.render('index', { title: null, pagename: "home" })
});

router.get('/about', (req, res) => {
    res.render('about', { title: "About", pagename: "about" })
});

router.get('/lookbook/gallery', (req, res) => {
    Lookbook_media.find({ media_type: "image" }, (err, images) => {
        res.render('lookbook-gallery', { title: "Lookbook (Gallery)", pagename: "lookbook-gallery" })
    })
});

router.get('/lookbook/tutorial', (req, res) => {
    Lookbook_media.find({ media_type: "video", is_tutorial: true }, (err, video) => {
        res.render('lookbook-tutorial', { title: "Lookbook (tutorial)", pagename: "lookbook-tutorial" })
    })
});

router.post('/lookbook/gallery/add', (req, res) => {
    const { media_file, media_url } = req.body;
    // const {  }
    // Lookbook_media.find({ media_type: "image" }, (err, images) => {
    //     res.render('lookbook-gallery', { title: "Lookbook (Gallery)", pagename: "lookbook-gallery" })
    // })
});

/* router.post('/homepage/content', isAuthed, (req, res) => {
    const { bg_underlay, overview_images, highlight_media_large, highlight_media_small, highlight_media_text } = req.body;
    Site_content.find((err, contents) => {
        const content = !contents.length ? new Site_content() : contents[0];
        // if (bg_underlay)           content.bg_underlay = bg_underlay;
        // if (overview_images)       content.overview_images = overview_images;
        // if (highlight_media_large) content.highlight_media_large = highlight_media_large;
        // if (highlight_media_small) content.highlight_media_small = highlight_media_small;
        // if (highlight_media_text)  content.highlight_media_text = highlight_media_text;
        const media = [
            { name: "bg_underlay", link: [bg_underlay] },
            { name: "overview_images", link: [overview_images] },
            { name: "highlight_media_large", link: [highlight_media_large] },
            { name: "highlight_media_small", link: [highlight_media_small] },
            { name: "highlight_media_text", link: [highlight_media_text] }
        ].filter(e => e);
        each(media, (item, cb) => {

        });
        content.save(err => res.send("Homepage content " + (!contents.length ? "saved" : "updated")));
    })
}); */

module.exports = router;
