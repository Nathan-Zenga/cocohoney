const router = require('express').Router();
const { Product } = require('../models/models');

router.get("/cart", (req, res) => {
    res.render('cart', { title: "Cart", pagename: "cart" })
});

router.post("/fx", (req, res) => {
    exchangeRates.symbols(req.body.currency).fetch().then(rate => {
        const symbol = curr_symbols[req.body.currency];
        req.session.fx_rate = rate;
        req.session.currency = req.body.currency.toLowerCase();
        req.session.currency_symbol = symbol;
        res.send({ rate, symbol });
    }).catch(err => res.status(500).send(err.message));
});

router.post("/cart/add", (req, res) => {
    Product.findById(req.body.id, (err, product) => {
        if (err) return res.status(500).send(err.message);
        if (!product || product.stock_qty < 1) return res.status(!product ? 404 : 400).send("Item currently not in stock");
        const { id, name, price, price_amb, image, info, stock_qty } = product;
        const cartItemIndex = req.session.cart.findIndex(item => item.id === id);
        const qty = parseInt(req.body.quantity);

        if (qty === NaN) return res.status(400).send("Quantity value not a number");
        if (cartItemIndex >= 0) {
            const currentItem = req.session.cart[cartItemIndex];
            currentItem.qty += qty;
            if (currentItem.qty > stock_qty) currentItem.qty = stock_qty;
        } else {
            const { is_ambassador } = res.locals || {};
            req.session.cart.unshift({ id, name, price: is_ambassador ? price_amb : price, image, info, stock_qty, qty });
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
    const { id, increment } = req.body;
    const cartItemIndex = req.session.cart.findIndex(item => item.id === id);
    const currentItem = req.session.cart[cartItemIndex];
    if (!currentItem) return res.status(404).send("Item not found, or the cart is empty");
    const newQuantity = currentItem.qty + parseInt(increment);
    if (newQuantity < 1) return res.status(400).send("Minimum item quantity limit reached");
    if (newQuantity > currentItem.stock_qty) return res.status(400).send("Maximum item quantity limit reached");
    currentItem.qty = newQuantity;
    res.send(`${currentItem.qty}`);
});

module.exports = router;
