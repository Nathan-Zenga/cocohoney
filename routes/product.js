const router = require('express').Router();
const cloud = require('cloudinary').v2;
const { each } = require('async');
const isAuthed = require('../modules/auth-check-admin');
const { Product } = require('../models/models');

router.get('/:category/collection/:product_collection', async (req, res, next) => {
    const { category, product_collection } = req.params;
    if (!category || !product_collection) return next();
    const coll = RegExp(`^${product_collection.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]")}$`, "gi");
    const collection = await Product.find({ category, product_collection: coll }).sort({ _id: -1 }).exec();
    if (!collection.length) return next();
    const title = collection[0].product_collection.split("_").map(char => char.charAt(0).toUpperCase() + char.slice(1).replace(/_/g, " ")).join(" ") + " Collection";
    res.render('product-collection', { title, pagename: "lash-collection", collection });
});

router.get('/:category/:name?', async (req, res, next) => {
    const { name: n, category: ctg } = req.params;
    if (!n) return next();
    const category = RegExp(`^${ ctg.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]") }$`, "gi");
    const name = RegExp(`^${ n.replace(/[_+]/g, " ") }$`, "i");
    const product = await Product.findOne({ category, name });
    if (!product) return next();
    res.render('product-view', { title: product.name, pagename: "product-view", product });
}, async (req, res, next) => {
    const { category } = req.params;
    if (!category) return next();
    const products = await Product.find({ category }).sort({ _id: -1 }).exec();
    if (!products.length) return next();
    const title = products[0].category.split("_").map(char => char.charAt(0).toUpperCase() + char.slice(1).replace(/_/g, " ")).join(" ");
    res.render('product-collection', { title, pagename: category, collection: products });
});

router.post('/stock/add', isAuthed, (req, res) => {
    const { name, price, price_amb, category, category_new, product_collection, stock_qty, info, image_file, image_url, pre_release } = req.body;
    const product = new Product({ name, price, price_amb, product_collection, stock_qty, info, pre_release });
    product.category = category_new || category;
    if (!image_url && !image_file) return product.save(() => res.send("Product saved in stock"));

    const public_id = ("cocohoney/product/stock/" + product.name).replace(/[ ?&#\\%<>]/g, "_");
    cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
        if (err) return res.status(err.http_code).send(err.message);
        product.image = { p_id: result.public_id, url: result.secure_url };
        product.save(() => res.send("Product saved in stock"));
    });
});

router.post('/stock/edit', isAuthed, (req, res) => {
    const { id, name, price, price_amb, category, category_new, product_collection, stock_qty, info, image_file, image_url, pre_release } = req.body;
    Product.findById(id, (err, product) => {
        if (err) return res.status(500).send(err.message || "Error occurred");
        if (!product) return res.status(404).send("Product not found");
        const p_id_prev = product.image.p_id;

        if (name)                     product.name = name;
        if (price)                    product.price = price;
        if (price_amb)                product.price_amb = price_amb;
        if (info)                     product.info = info;
        if (category_new || category) product.category = category_new || category;
        if (product_collection)       product.product_collection = product_collection;
        if (stock_qty)                product.stock_qty = stock_qty;
                                      product.pre_release = !!pre_release;

        product.save((err, saved) => {
            if (err) return res.status(500).send(err.message || "Error occurred whilst saving product");
            if (!image_url && !image_file) return res.send("Product details updated successfully");
            const public_id = ("cocohoney/product/stock/" + saved.name).replace(/[ ?&#\\%<>]/g, "_");
            cloud.api.delete_resources([p_id_prev], () => {
                cloud.uploader.upload(image_url || image_file, { public_id }, (err, result) => {
                    if (err) return res.status(err.http_code).send(err.message);
                    saved.image = { p_id: result.public_id, url: result.secure_url };
                    saved.save(() => { res.send("Product details updated successfully") });
                });
            });
        });
    })
});

router.post('/stock/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Product.find({_id : { $in: ids }}, (err, products) => {
        if (err) return res.status(500).send(err.message);
        if (!products.length) return res.status(404).send("No products found");
        each(products, (item, cb) => {
            Product.deleteOne({ _id : item.id }, (err, result) => {
                if (err || !result.deletedCount) return cb(err || "Product(s) not found");
                cloud.api.delete_resources([item.image.p_id], () => cb());
            })
        }, err => {
            if (!err) return res.send("Product"+ (ids.length > 1 ? "s" : "") +" deleted from stock successfully");
            let is404 = err === "Product(s) not found";
            res.status(!is404 ? 500 : 404).send(!is404 ? err.message : "Product(s) not found");
        })
    });
});

module.exports = router;
