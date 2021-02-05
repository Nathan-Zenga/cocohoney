const { model, Schema } = require('mongoose');
Schema.Types.String.set('trim', true);

module.exports.Sale = model('Sale', Schema({
    active: Boolean,
    sitewide: Boolean,
    percentage: { type: Number, min: 1, max: 100 }
}));

module.exports.Product = model('Product', Schema({
    name: { type: String, index: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_amb: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : n },
    price_sale: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : n },
    image: { p_id: String, url: String },
    category: { type: String, set: v => v.toLowerCase().replace(/ /g, "_") },
    info: { type: String, default: "" },
    product_collection: { type: String, default: "" },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] },
    pre_release: { type: Boolean, default: false }
}));

module.exports.Member = model('Member', Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    image: { p_id: String, url: String },
    phone_number: String,
    password_reset_token: String,
    mail_sub: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Admin = model('Admin', Schema({
    email: { type: String, index: true, required: true },
    password: { type: String, required: true },
    admin: { type: Boolean, default: true },
    token_expiry_date: Date
}));

module.exports.Lookbook_media = model('Lookbook_media', Schema({
    p_id: String,
    url: String,
    orientation: String,
    position: Number,
    media_type: { type: String, default: "image" },
    tutorial: { type: Boolean, default: false }
}));

module.exports.Banner_slide = model('Banner_slide', Schema({
    text: String
}));

module.exports.Overview_image = model('Overview_image', Schema({
    p_id: String,
    url: String,
    position: Number
}));

module.exports.Shipping_method = model('Shipping_method', Schema({
    name: String,
    info: String,
    fee: { type: Number, set: n => parseFloat(n) * 100 }
}));

module.exports.Shipping_page = model('Shipping_page', Schema({
    info: String
}), 'shipping_page');

module.exports.Discount_code = model('Discount_code', Schema({
    code: { type: String, required: true },
    percentage: { type: Number, min: 1, max: 100 },
    orders_applied: [String], // array of order IDs
    expiry_date: { type: Date, required: true }
}));

module.exports.Order = model('Order', Schema({
    cart: Array,
    discounted: { type: Boolean, default: false },
    customer_name: String,
    customer_email: String,
    shipping_method: String,
    destination: { type: Object, default: {} },
    tracking_ref: { type: String, default: null },
    mail_sub: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Ambassador = model('Ambassador', Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone_number: String,
    address: {
        line1: { type: String, default: "" },
        line2: { type: String, default: "" },
        city: { type: String, default: "" },
        country: { type: String, default: "" },
        postcode: { type: String, default: "" }
    },
    instagram: { type: String, set: v => v.trim().replace(/^\@/, "") },
    password: { type: String, required: [() => this.verified === true, "Account needs to be verified first to set a new password"] },
    sort_code: {
        type: String,
        validate: {
            validator: v => /^\d{2}-\d{2}-\d{2}$/.test(v),
            message: props => `Sort code is not valid or in the right format (e.g. 22-03-15)`
        }
    },
    account_number: {
        type: String,
        validate: {
            validator: v => /^[0-9]*$/.test(v),
            message: props => `No letters, special characters or spaces allowed for the account number`
        }
    },
    image: { p_id: String, url: String },
    token: String,
    verified: { type: Boolean, default: false },
    discount_code: { type: String, default: "null" },
    ambassador: { type: Boolean, default: true },
    password_reset_token: String,
    mail_sub: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.FAQ = model('FAQ', Schema({
    question: String,
    answer: String
}));

module.exports.Box = model('Box', Schema({
    name: { type: String, required: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_sale: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : n },
    info: String,
    max_items: { type: Number, min: 0, required: true },
    image: { p_id: String, url: String },
    products_inc: [String] // array of product IDs
}));

module.exports.Review = model('Review', Schema({
    headline: String,
    commentry: { type: String, required: true },
    author_name: { type: String, required: true },
    author_verified: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    images: [{ p_id: String, url: String }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Highlights_post = model('Highlights_post', Schema({
    media_lg: { p_id: String, url: String, media_type: String },
    media_sm: { p_id: String, url: String, media_type: String },
    title: String,
    text_body: String,
    link: String
}));

module.exports.Wishlist = model('Wishlist', Schema({
    customer_id: { type: String, required: true, index: true, unique: true },
    items: [String] // array of product IDs
}), 'wishlist');

module.exports.Event = model('Event', Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    ttbc: { type: Boolean, value: false },
    info: String,
    price: { type: Number, required: true, set: n => parseFloat(n) * 100 },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] },
    image: { p_id: String, url: String }
}));
