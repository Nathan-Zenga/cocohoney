const router = require('express').Router();
const isAuthed = require('../modules/authCheck');
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
        if (quantities.reduce((sum, i) => sum + parseInt(i), 0) !== box.max_items) return res.status(400).send(`Please choose ${box.max_items} items`);

        Product.find({ _id: { $in: product_ids }, stock_qty: { $gt: 0 } }, (err, products) => {
            if (err) return res.status(500).send(err.message);
            if (!products.length) return res.status(404).send("Chosen items currently not in stock");
            if (product_ids.length !== products.length) return res.status(404).send("One or more of the chosen items aren't in stock");

            const deal_item = {};
            deal_item.id = box.id;
            deal_item.name = box.name + " Box";
            deal_item.price = box.price;
            deal_item.qty = 1;
            deal_item.deal = true;
            deal_item.items = [];

            const item_qty_excess = {};
            for (let i = 0; i < products.length; i++) {
                const { id, name, category, images, info, stock_qty } = products[i];
                if (quantities[i] < 1) { item_qty_excess.min = true; item_qty_excess.name = name; break }
                if (quantities[i] > stock_qty) { item_qty_excess.max = true; item_qty_excess.name = name; break }
                deal_item.items.unshift({ id, name, category, image: images[0], info, stock_qty, qty: quantities[i] });
            };
            if (item_qty_excess.min) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is below the minimum limit`);
            if (item_qty_excess.max) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is over the maximum limit`);

            cart.unshift(deal_item);
            res.send(`${cart.length}`);
        })
    })
});

router.post('/box/add', isAuthed, (req, res) => {
    const { name, price, info, max_items } = req.body;
    new Box({ name, price, info, max_items }).save(err => res.send("Box saved"));
});

router.post('/box/edit', isAuthed, (req, res) => {
    const { id, name, price, info, max_items } = req.body;
    Box.findById(id, (err, faq) => {
        if (err) return res.status(500).send(err.message);
        if (name) faq.name = name;
        if (price) faq.price = price;
        if (info) faq.info = info;
        if (max_items) faq.max_items = max_items;
        faq.save(err => res.send("Box updated"));
    });
});

router.post('/box/remove', isAuthed, (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    Box.deleteMany({_id : { $in: ids }}, (err, result) => {
        if (err) return res.status(500).send(err ? err.message : "Error occurred");
        if (!result.deletedCount) return res.status(404).send("Box(s) not found");
        res.send("Box"+ (ids.length > 1 ? "s" : "") +" removed successfully")
    })
});

module.exports = router;
