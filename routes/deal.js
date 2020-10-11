const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { each } = require('async');
const isAuthed = require('../modules/auth-check-admin');
const { Box, Product } = require('../models/models');

router.get('/:name', (req, res, next) => {
    if (!req.params.name) return next();
    const name = { $regex: RegExp(`^${req.params.name.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]")}$`, "gi") };
    Box.findOne({ name }, (err, box) => {
        if (!box) return next();
        Product.find().sort({ product_collection: -1 }).exec((err, products) => {
            res.render('box-deal', { title: `${box.name} Box`, pagename: "box-deal", box, products })
        })
    })
});

router.post("/cart/add", (req, res) => {
    const { box_id, product_id, quantity, cart } = Object.assign(req.body, req.session);
    const product_ids = (Array.isArray(product_id) ? product_id : [product_id]).filter(e => e);
    const quantities = (Array.isArray(quantity) ? quantity : [quantity]).filter(e => e);
    if (product_ids.length !== quantities.length) return res.status(400).send("Number of products and quantities don't match");

    Box.findById(box_id, (err, box) => {
        if (err) return res.status(500).send(err.message);
        if (!box) return res.status(404).send("Box deal does not exist");
        if (quantities.reduce((sum, i) => sum + parseInt(i), 0) !== box.max_items) return res.status(400).send(`Please choose ${box.max_items} items\nClick the image(s) to choose or re-adjust the quantities`);

        Product.find({ _id: { $in: product_ids }, stock_qty: { $gt: 0 } }, (err, products) => {
            if (err) return res.status(500).send(err.message);
            if (!products.length) return res.status(404).send("Chosen item(s) currently not in stock");
            if (product_ids.length !== products.length) return res.status(404).send("One or more of the chosen items currently not in stock");

            const deal_item = {};
            deal_item.id = box.id;
            deal_item.name = box.name + " Box";
            deal_item.price = !res.locals.is_ambassador && box.price_sale ? box.price_sale : box.price;
            deal_item.qty = 1;
            deal_item.deal = true;
            deal_item.items = [];
            deal_item.image = box.image;

            const item_qty_excess = {};
            for (let i = 0; i < products.length; i++) {
                const { id, name, category, image, info, stock_qty } = products[i];
                if (quantities[i] < 1) { item_qty_excess.min = true; item_qty_excess.name = name; break }
                if (quantities[i] > stock_qty) { item_qty_excess.max = true; item_qty_excess.name = name; break }
                deal_item.items.unshift({ id, name, category, image, info, stock_qty, qty: quantities[i] });
            };
            if (item_qty_excess.min) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is below the minimum limit`);
            if (item_qty_excess.max) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is over the maximum limit`);

            cart.unshift(deal_item);
            res.send(`${cart.length}`);
        })
    })
});

router.post('/box/add', isAuthed, (req, res) => {
    const { name, price, info, max_items, image_file, image_url } = req.body;
    const box = new Box({ name, price, info, max_items });
    if (!image_file && !image_url) return box.save(err => res.send("Box deal saved"));

    const public_id = ("cocohoney/product/box_deals/" + box.name).replace(/[ ?&#\\%<>]/g, "_");
    cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
        if (err) return res.status(500).send(err.message);
        box.image = { p_id: result.public_id, url: result.secure_url };
        box.save(() => res.send("Box deal saved"));
    });
});

router.post('/box/edit', isAuthed, (req, res) => {
    const { id, name, price, info, max_items, image_file, image_url } = req.body;
    Box.findById(id, (err, box) => {
        if (err) return res.status(500).send(err.message);
        const p_id_prev = ("cocohoney/product/box_deals/" + box.name).replace(/[ ?&#\\%<>]/g, "_");
        if (name) box.name = name;
        if (price) box.price = price;
        if (info) box.info = info;
        if (max_items) box.max_items = max_items;

        box.save((err, saved) => {
            if (err) return res.status(500).send(err.message || "Error occurred whilst saving product");
            if (!image_url && !image_file) return res.send("Box details updated successfully");
            const public_id = ("cocohoney/product/box_deals/" + saved.name).replace(/[ ?&#\\%<>]/g, "_");
            cloud.api.delete_resources([p_id_prev], err => {
                if (err) return res.status(500).send(err.message);
                cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                    if (err) return res.status(500).send(err.message);
                    saved.image = { p_id: result.public_id, url: result.secure_url };
                    saved.save(() => { res.send("Box details updated successfully") });
                });
            });
        });
    });
});

router.post('/box/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Box.find({_id : { $in: ids }}, (err, boxes) => {
        if (err) return res.status(500).send(err.message);
        if (!boxes.length) return res.status(400).send("No boxes found");
        each(boxes, (item, cb) => {
            Box.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err ? err.message : "Box(s) not found");
                cloud.api.delete_resources([item.image.p_id], () => cb());
            })
        }, err => {
            if (!err) return res.send("Box"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err.message === "Box(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? "Error occurred" : "Box(s) not found");
        })
    });
});

module.exports = router;
