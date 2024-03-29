const router = require('express').Router();
const cloud = require('cloudinary').v2;
const isAuthed = require('../modules/auth-check-admin');
const { Box, Product } = require('../models/models');

router.get('/:name', async (req, res, next) => {
    if (!req.params.name) return next();
    const name = { $regex: RegExp(`^${req.params.name.replace(/[\_\+\- ]/g, "[\\\_\\\+\\\- ]")}$`, "gi") };
    const box = await Box.findOne({ name });
    if (!box) return next();
    const products = await Product.find({ _id: { $in: box.products_inc } }).sort({ product_collection: -1, category: 1, _id: -1 }).exec();
    res.render('box-deal', { title: `${box.name} Box`, pagename: "box-deal", box, products })
});

router.post("/cart/add", async (req, res) => {
    const { box_id, product_id, quantity, cart } = Object.assign(req.body, req.session);
    const product_ids = (Array.isArray(product_id) ? product_id : [product_id]).filter(e => e);
    const quantities = (Array.isArray(quantity) ? quantity : [quantity]).map(q => parseInt(q)).filter(q => !isNaN(q));
    if (product_ids.length !== quantities.length) return res.status(400).send("Number of products and quantities don't match");

    try {
        const box = await Box.findById(box_id);
        if (!box) return res.status(404).send("Box deal does not exist");
        const item_count = product_ids.length;
        const quantity_count = quantities.reduce((sum, q) => sum + parseInt(q), 0);
        const count_not_reached = item_count !== box.max_items && quantity_count !== box.max_items;
        if (count_not_reached) return res.status(400).send(`Please choose ${box.max_items} items\nClick the image(s) to choose or change the quantities`);

        const products = product_ids.length ? await Product.find({ _id: { $in: product_ids }, stock_qty: { $gt: 0 } }) : [];
        if (product_ids.length && !products.length) return res.status(404).send("Chosen item(s) currently not in stock");
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
        for (let i = 0; i < product_ids.length; i++) {
            const { id, name, category, image, info, stock_qty } = products.find(p => p.id == product_ids[i]);
            const products_selected = cart.filter(item => item.deal).map(item => item.items).flat().filter(itm => itm.id === id);
            const qty_total = products_selected?.reduce((sum, item) => sum + item.qty, 0) || 0;
            if (quantities[i] < 1) { item_qty_excess.min = true; item_qty_excess.name = name; break }
            if (quantities[i] > stock_qty) { item_qty_excess.max = true; item_qty_excess.name = name; break }
            if (qty_total + quantities[i] > stock_qty) { item_qty_excess.over = true; item_qty_excess.name = name; break }
            deal_item.items.unshift({ id, name, category, image, info, stock_qty, qty: quantities[i] });
        }
        if (item_qty_excess.min) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is below the minimum limit`);
        if (item_qty_excess.max) return res.status(400).send(`Quantity specified for "${item_qty_excess.name}" is above the maximum limit`);
        if (item_qty_excess.over) return res.status(400).send(`You already have the last remaining "${item_qty_excess.name}" items added to your basket`);

        cart.unshift(deal_item);
        res.send(`${cart.length}`);
    } catch (err) { res.status(500).send(err.message) }
});

router.post('/box/add', isAuthed, async (req, res) => {
    const { name, price, info, image_file, image_url, max_items, box_item } = req.body;
    const box = new Box({ name, price, info, max_items });
    box.products_inc = (Array.isArray(box_item) ? box_item : [box_item]).filter(e => e);
    try {
        const public_id = `cocohoney/product/box_deals/${box.name}`.replace(/[ ?&#\\%<>+]/g, "_");
        const result = image_file || image_url ? await cloud.uploader.upload(image_url || image_file, { public_id }) : null;
        if (result) box.image = { p_id: result.public_id, url: result.secure_url };
        await box.save(); res.send("Box deal saved");
    } catch(err) { res.status(err.http_code || 400).send(err.message) }
});

router.post('/box/edit', isAuthed, async (req, res) => {
    const { id, name, price, info, image_file, image_url, max_items, box_item } = req.body;
    try {
        const box = await Box.findById(id);
        if (!box) return res.status(404).send("Box deal not found");
        const p_id_prev = `cocohoney/product/box_deals/${box.name}`.replace(/[ ?&#\\%<>+]/g, "_");

        if (name)      box.name = name;
        if (price)     box.price = price;
        if (info)      box.info = info;
        if (max_items) box.max_items = max_items;
                       box.products_inc = box_item ? Array.isArray(box_item) ? box_item : [box_item] : [];

        if (!image_url && !image_file) { await box.save(); return res.send("Box details updated successfully") }
        const public_id = `cocohoney/product/box_deals/${box.name}`.replace(/[ ?&#\\%<>+]/g, "_");
        const result = await cloud.uploader.upload(image_url || image_file, { public_id });
        p_id_prev != public_id && await cloud.api.delete_resources([p_id_prev]).catch(e => e);
        box.image = { p_id: result.public_id, url: result.secure_url };
        await box.save(); res.send("Box details updated successfully");
    } catch (err) { res.status(err.http_code || 500).send(err.message) }
});

router.post('/box/remove', isAuthed, async (req, res) => {
    const ids = Object.values(req.body);
    if (!ids.length) return res.status(400).send("Nothing selected");
    try {
        const boxes = await Box.find({_id : { $in: ids }});
        if (!boxes.length) return res.status(404).send("No box deal found");
        if (ids.length > boxes.length) return res.status(404).send("One or more box deals not found");
        await Promise.allSettled(boxes.map(b => cloud.api.delete_resources([b.image.p_id])));
        await Box.deleteMany({ _id: { $in: boxes.map(b => b.id) } });
        res.send("Box deal"+ (ids.length > 1 ? "s" : "") +" deleted successfully");
    } catch (err) { res.status(500).send(err.message) }
});

module.exports = router;
