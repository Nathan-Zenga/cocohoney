const router = require('express').Router();
const { Product, Wishlist } = require('../models/models');

router.post("/add", async (req, res) => {
    const { user, is_admin } = res.locals;
    const product = await Product.findById(req.body.id);
    if (!user) return res.status(401).send("Please log in to add items to your wishlist");
    if (is_admin) return res.status(401).send("Please log in as a customer or ambassador to add wishlist items");
    if (!product) return res.status(404).send("Item does not exist");
    const wishlist = await Wishlist.findOne({ customer_id: user._id }) || new Wishlist({ customer_id: user._id });
    !wishlist.items.includes(product.id) && wishlist.items.push(product.id);
    wishlist.save(err => res.send("Item added to your wishlist"));
});

router.post("/remove", async (req, res) => {
    const { user, is_admin, id: product_id } = { ...res.locals, ...req.body };
    if (!user) return res.status(401).send("Please log in to remove items to your wishlist");
    if (is_admin) return res.status(401).send("Please log in as a customer or ambassador to remove wishlist items");
    const wishlist = await Wishlist.findOne({ customer_id: user._id });
    if (!wishlist) return res.status(404).send("Wishlist not found");
    wishlist.items = wishlist.items.filter(id => id !== product_id);
    wishlist.save(err => res.send("Item successfully removed"));
});

module.exports = router;
