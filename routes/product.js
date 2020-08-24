const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/authCheck');
const { Product } = require('../models/models');

router.get('/:type', (req, res, next) => {
    const { type } = req.params;
    if (!type) return next();
    Product.find({ type }).sort({ _id: -1 }).exec((err, products) => {
        if (!products.length) return next();
        res.render('products', { title: null, pagename: "product", products });
    })
});

router.get('/:type/collection/:group', (req, res, next) => {
    const { type, group } = req.params;
    if (!type && !group) return next();
    Product.find({ type, group }).sort({ _id: -1 }).exec((err, collection) => {
        if (!collection.length) return next();
        res.render('product-collection', { title: "Collections", pagename: "collection", collection });
    })
});

router.get('/:type/:product_name', (req, res, next) => {
    const { type, product_name } = req.params;
    if (!type && !product_name) return next();
    Product.findOne({ type, name: product_name }).sort({ _id: -1 }).exec((err, product) => {
        if (!product) return next();
        res.render('product', { title: null, pagename: "product", product });
    })
});

router.post('/stock/add', isAuthed, (req, res) => {
    const { name, price, group, stock_qty, info, image_file, image_url } = req.body;
    new Product({ name, price, group, stock_qty, info }).save((err, saved) => {
        if (err) return res.status(400).send(err.message);
        if (!image_url && !image_file) return res.send("Product saved in stock");
        const public_id = ("shop/stock/" + saved.name.replace(/ /g, "-")).replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
            if (err) return res.status(500).send(err.message);
            saved.image = result.secure_url;
            saved.save(() => { res.send("Product saved in stock") });
        });
    });
});

router.post('/stock/edit', isAuthed, (req, res) => {
    const { product_id, name, price, stock_qty, info, image_file, image_url } = req.body;
    Product.findById(product_id, (err, product) => {
        if (err || !product) return res.status(err ? 500 : 404).send(err ? err.message || "Error occurred" : "Product not found");

        const prefix = ("shop/stock/" + product.name.replace(/ /g, "-")).replace(/[ ?&#\\%<>]/g, "_");
        if (name) product.name = name;
        if (price) product.price = price;
        if (info) product.info = info;
        if (stock_qty) {
            product.stock_qty = stock_qty;
            req.session.cart = req.session.cart.map(item => {
                if (item.id === product.id) item.stock_qty = stock_qty;
                return item;
            });
        };

        product.save((err, saved) => {
            if (err) return res.status(500).send(err.message || "Error occurred whilst saving product");
            if (!image_url && !image_file) return res.send("Product details updated successfully");
            const public_id = ("shop/stock/" + saved.name.replace(/ /g, "-")).replace(/[ ?&#\\%<>]/g, "_");
            cloud.api.delete_resources([prefix], err => {
                if (err) return res.status(500).send(err.message);
                cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                    if (err) return res.status(500).send(err.message);
                    saved.image = result.secure_url;
                    for (const item of req.session.cart) if (item.id === saved.id) item.image = result.secure_url;
                    saved.save(() => { res.send("Product details updated successfully") });
                });
            })
        });
    })
});

router.post("/stock/remove", isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.send("Nothing selected");
    Product.find({_id : { $in: ids }}, (err, products) => {
        each(products, (item, cb) => {
            Product.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err ? err.message : "Product(s) not found");
                const prefix = ("shop/stock/" + item.name.replace(/ /g, "-")).replace(/[ ?&#\\%<>]/g, "_");
                cloud.api.delete_resources([prefix], () => cb());
            })
        }, err => {
            if (!err) return res.send("Product"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err.message === "Product(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? "Error occurred" : "Product(s) not found");
        })
    });
});

module.exports = router;
