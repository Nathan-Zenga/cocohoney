const router = require('express').Router();
const { Product } = require('../models/models');

router.get("/cart", (req, res) => {
    res.render('cart', { title: "Cart", pagename: "cart" })
});

router.post("/cart/add", (req, res) => {
    Product.findById(req.body.id, (err, product) => {
        if (err) return res.status(500).send(err.message);
        if (!product || product.stock_qty < 1) return res.status(!product ? 404 : 400).send("Item currently not in stock");
        const { id, name, price, price_amb, price_sale, image, info, stock_qty } = product;
        const cartItemIndex = req.session.cart.findIndex(item => item.id === id);
        const qty = parseInt(req.body.quantity);

        if (isNaN(qty)) return res.status(400).send("Quantity value not a number");
        if (cartItemIndex >= 0) {
            const currentItem = req.session.cart[cartItemIndex];
            currentItem.qty += qty;
            if (currentItem.qty > stock_qty) currentItem.qty = stock_qty;
        } else {
            if (qty < 1) return res.status(400).send("Quantity is under the limit");
            if (qty > stock_qty) return res.status(400).send("Quantity is over the limit");
            const { is_ambassador } = res.locals;
            const price_rendered = is_ambassador ? price_amb : price_sale ? price_sale : price;
            const sale_item = price_rendered === price_sale;
            req.session.cart.unshift({ id, name, price: price_rendered, sale_item, image, info, stock_qty, qty });
        }

        res.send(`${req.session.cart.length}`);
    })
});

router.post("/cart/remove", (req, res) => {
    const cartItemIndex = req.session.cart.findIndex(item => item.id === req.body.id);
    if (cartItemIndex === -1) return res.status(400).send("Item not found, or the cart is empty");
    req.session.cart.splice(cartItemIndex, 1);
    res.send(`${req.session.cart.length}`);
});

router.post("/cart/increment", (req, res) => {
    const cartItemIndex = req.session.cart.findIndex(item => item.id === req.body.id);
    const currentItem = req.session.cart[cartItemIndex];
    if (!currentItem) return res.status(404).send("Item not found, or the cart is empty");
    const newQuantity = currentItem.qty + parseInt(req.body.increment);
    if (newQuantity < 1) return res.status(400).send("Minimum item quantity limit reached");
    if (newQuantity > currentItem.stock_qty) return res.status(400).send("Maximum item quantity limit reached");
    currentItem.qty = newQuantity;
    res.send(`${currentItem.qty}`);
});

module.exports = router;
