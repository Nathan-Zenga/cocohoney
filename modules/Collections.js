const { Member, Product, Banner_slide, Discount_code } = require('../models/models');

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
    cb(docs);
};
