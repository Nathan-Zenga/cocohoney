const router = require('express').Router();
const { Product } = require('../models/models');

router.get("/cart", (req, res) => res.render('cart', { title: "Cart", pagename: "cart" }));

router.post("/cart/add", async (req, res) => {
    const product = await Product.findById(req.body.id).catch(e => null);
    if (!product || product.stock_qty < 1) return res.status(!product ? 404 : 400).send("Item currently not in stock");
    const { id, name, price, price_amb, price_sale, image, info, stock_qty } = product;
    const selectedItem = req.session.cart.find(item => item.id === id);
    const qty = parseInt(req.body.quantity);

    if (isNaN(qty)) return res.status(400).send("Quantity value not a number");
    if (selectedItem) {
        selectedItem.qty += qty;
        if (selectedItem.qty > stock_qty) selectedItem.qty = stock_qty;
    } else {
        if (qty < 1) return res.status(400).send("Quantity is under the limit");
        if (qty > stock_qty) return res.status(400).send("Quantity is over the limit");
        const price_rendered = res.locals.is_ambassador ? price_amb : price_sale || price;
        const sale_item = price_rendered === price_sale;
        req.session.cart.unshift({ id, name, price: price_rendered, sale_item, image, info, stock_qty, qty });
    }

    res.send(`${req.session.cart.length}`);
});

router.post("/cart/remove", (req, res) => {
    const cartItemIndex = req.session.cart.findIndex(item => item.id === req.body.id);
    if (cartItemIndex === -1) return res.status(400).send("Item not found, or the cart is empty");
    req.session.cart.splice(cartItemIndex, 1);
    res.send(`${req.session.cart.length}`);
});

router.post("/cart/increment", (req, res) => {
    const selectedItem = req.session.cart.find(item => item.id === req.body.id);
    if (!selectedItem) return res.status(404).send("Item not found, or the cart is empty");
    const newQuantity = selectedItem.qty + parseInt(req.body.increment);
    if (newQuantity < 1) return res.status(400).send("Minimum item quantity limit reached");
    if (newQuantity > selectedItem.stock_qty) return res.status(400).send("Maximum item quantity limit reached");
    selectedItem.qty = newQuantity;
    res.send(`${selectedItem.qty}`);
});

module.exports = router;
