const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/authCheck');
const { Product } = require('../models/models');

router.get('/:category/collection/:product_collection', (req, res, next) => {
    const { category, product_collection } = req.params;
    if (!category || !product_collection) return next();
    const coll = { $regex: RegExp(`^${product_collection.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]")}$`, "gi") };
    const stock_qty = { $gt: 0 };
    Product.find({ stock_qty, category, product_collection: coll }).sort({ _id: -1 }).exec((err, collection) => {
        if (!collection.length) return next();
        const title = collection[0].product_collection.split("_").map(char => char.charAt(0).toUpperCase() + char.slice(1).replace(/_/g, " ")).join(" ") + " Collection";
        res.render('product-collection', { title, pagename: "lash-collection", collection });
    })
});

router.get('/:category/:name', (req, res, next) => {
    const category = { $regex: RegExp(`^${req.params.category.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]")}$`, "gi") };
    const name = { $regex: RegExp(`^${req.params.name.replace(/[_+]/g, " ")}$`, "i") };
    Product.findOne({ category, name, stock_qty: { $gt: 0 } }, (err, product) => {
        if (err || !product) return next();
        res.render('product-view', { title: product.name, pagename: "product-view", product });
    })
});

router.post('/stock/add', isAuthed, (req, res) => {
    const { name, price, price_amb, category, product_collection, stock_qty, info, image_file, image_url } = req.body;
    new Product({ name, price, price_amb, category, product_collection, stock_qty, info }).save((err, saved) => {
        if (err) return res.status(400).send(err.message);
        if (!image_url && !image_file) return res.send("Product saved in stock");
        const public_id = ("cocohoney/product/stock/" + saved.name).replace(/[ ?&#\\%<>]/g, "_");
        cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
            if (err) return res.status(500).send(err.message);
            saved.images = [{ p_id: result.public_id, url: result.secure_url }];
            saved.save(() => { res.send("Product saved in stock") });
        });
    });
});

router.post('/stock/edit', isAuthed, (req, res) => {
    const { id, name, price, price_amb, category, product_collection, stock_qty, info, image_file, image_url } = req.body;
    Product.findById(id, (err, product) => {
        if (err || !product) return res.status(err ? 500 : 404).send(err ? err.message || "Error occurred" : "Product not found");

        const prefix = ("cocohoney/product/stock/" + product.name).replace(/[ ?&#\\%<>]/g, "_");
        if (name)               product.name = name;
        if (price)              product.price = price;
        if (price_amb)          product.price_amb = price_amb;
        if (info)               product.info = info;
        if (category)           product.category = category;
        if (product_collection) product.product_collection = product_collection;
        if (stock_qty) {
            product.stock_qty = stock_qty;
            req.session.cart = req.session.cart.map(item => {
                if (item.id === product.id) item.stock_qty = stock_qty;
                return item;
            });
        };

        product.save((err, saved) => {
            if (err) return res.status(500).send(err.message || "Error occurred whilst saving product");
            res.send("Product details updated successfully");
        });
    })
});

router.post('/stock/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.send("Nothing selected");
    Product.find({_id : { $in: ids }}, (err, products) => {
        each(products, (item, cb) => {
            Product.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err ? err.message : "Product(s) not found");
                cloud.api.delete_resources([item.p_id], () => cb());
            })
        }, err => {
            if (!err) return res.send("Product"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err.message === "Product(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? "Error occurred" : "Product(s) not found");
        })
    });
});

module.exports = router;
