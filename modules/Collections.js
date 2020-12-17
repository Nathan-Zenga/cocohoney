const { Member, Product, Banner_slide, Discount_code, FAQ, Shipping_method, Box, Overview_image, Lookbook_media, Ambassador, Order, Highlights_post, Shipping_page, Event, Info, Sale, Subscription_plan } = require('../models/models');

/**
 * Getting all documents from all collections
 * @param {function} cb callback with passed document collections as arguments
 * @callback cb
 */
module.exports = async cb => {
    const docs = {};
    docs.products = await Product.find().sort({ product_collection: -1, category: 1, name: 1 }).exec();
    docs.members = await Member.find().sort({ firstname: 1 }).exec();
    docs.ambassadors = await Ambassador.find().sort({ verified: 1, firstname: 1 }).exec();
    docs.banner_slides = await Banner_slide.find();
    docs.discount_codes = await Discount_code.find();
    docs.faqs = await FAQ.find();
    docs.shipping_methods = await Shipping_method.find().sort({ fee: 1 }).exec();
    docs.boxes = await Box.find();
    docs.overview_images = await Overview_image.find().sort({ position: 1 }).exec();
    docs.lookbook_media = await Lookbook_media.find();
    docs.orders = await Order.find().sort({ tracking_ref: 1, created_at: -1 }).exec();
    docs.highlights_posts = await Highlights_post.find();
    docs.shipping_page = await Shipping_page.find();
    docs.events = await Event.find().sort({ date: -1 }).exec();
    docs.info = await Info.find();
    docs.sale_docs = await Sale.find();
    docs.subscription_plans = await Subscription_plan.find();
    cb(docs);
};
