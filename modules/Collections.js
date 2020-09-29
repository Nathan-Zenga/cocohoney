const { Member, Product, Banner_slide, Discount_code, FAQ, Shipping_method, Box, Overview_image } = require('../models/models');

/**
 * Getting all documents from all collections
 * @param {function} cb callback with passed document collections as arguments
 * @callback cb
 */
module.exports = async cb => {
    const docs = {};
    docs.products = await Product.find().sort({ product_collection: -1, name: 1 }).exec();
    docs.members = await Member.find();
    docs.banner_slides = await Banner_slide.find();
    docs.discount_codes = await Discount_code.find();
    docs.faqs = await FAQ.find();
    docs.shipping_methods = await Shipping_method.find().sort({ fee: 1 }).exec();
    docs.boxes = await Box.find();
    docs.overview_images = await Overview_image.find();
    cb(docs);
};
