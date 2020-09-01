const { Member, Product } = require('../models/models');

/**
 * Getting all documents from all collections
 * @param {function} cb callback with passed document collections as arguments
 * @callback cb
 */
module.exports = async cb => {
    const docs = {};
    docs.products = await Product.find();
    docs.members = await Member.find();
    cb(docs);
};
