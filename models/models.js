const { model, Schema } = require('mongoose');
Schema.Types.String.set('trim', true);

module.exports.Sale = model('Sale', new Schema({
    active: { type: Boolean, default: false },
    sitewide: { type: Boolean, default: false },
    percentage: { type: Number, min: 0, max: 100 },
    end_datetime: { type: Date, default: Date.now() }
}));

module.exports.Product = model('Product', new Schema({
    name: { type: String, index: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_amb: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : null },
    price_sale: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : null },
    image: { p_id: String, url: String },
    category: { type: String, set: v => v.toLowerCase().replace(/ /g, "_") },
    info: { type: String, default: "" },
    product_collection: { type: String, default: "" },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] },
    pre_release: { type: Boolean, default: false }
}));

module.exports.Member = model('Member', (() => {
    const schema = new Schema({
        firstname: { type: String, required: true },
        lastname: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        image: { p_id: String, url: String },
        phone_number: String,
        password_reset_token: String,
        mail_sub: { type: Boolean, default: true }
    }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

    schema.virtual("role").get(_ => "member");
    return schema;
})());

module.exports.Admin = model('Admin', (() => {
    const schema = new Schema({
        email: { type: String, index: true, required: true },
        password: { type: String, required: true },
        token_expiry_date: Date
    });

    schema.virtual("role").get(_ => "admin");
    return schema;
})());

module.exports.Lookbook_media = model('Lookbook_media', new Schema({
    p_id: String,
    url: String,
    orientation: String,
    position: Number,
    media_type: { type: String, default: "image" },
    tutorial: { type: Boolean, default: false }
}));

module.exports.Banner_slide = model('Banner_slide', new Schema({
    text: String
}));

module.exports.Overview_image = model('Overview_image', new Schema({
    p_id: String,
    url: String,
    position: Number
}));

module.exports.Shipping_method = model('Shipping_method', new Schema({
    name: { type: String, required: true },
    info: { type: String, required: true },
    fee: { type: Number, set: n => parseFloat(n) * 100 }
}));

module.exports.Shipping_page = model('Shipping_page', new Schema({
    info: { type: String, default: "" }
}), 'shipping_page');

module.exports.Discount_code = model('Discount_code', new Schema({
    code: { type: String, required: true },
    percentage: { type: Number, min: 1, max: 100 },
    orders_applied: [String], // array of order IDs
    expiry_date: { type: Date, required: true }
}));

module.exports.Order = model('Order', new Schema({
    cart: Array,
    discounted: { type: Boolean, default: false },
    customer_name: String,
    customer_email: String,
    shipping_method: String,
    destination: { type: Object, default: {} },
    tracking_ref: { type: String, default: null },
    mail_sub: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Ambassador = model('Ambassador', (() => {
    const schema = new Schema({
        firstname: { type: String, required: true },
        lastname: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        phone_number: String,
        address: {
            line1: { type: String, default: "" },
            line2: { type: String, default: "" },
            city: { type: String, default: "" },
            country: { type: String, default: "" },
            state: { type: String, default: "" },
            postcode: { type: String, default: "" }
        },
        instagram: { type: String, set: v => v.trim().replace(/^\@/, "") },
        password: { type: String, required: [() => this.verified === true, "Account needs to be verified first to set a new password"] },
        sort_code: {
            type: String,
            validate: {
                validator: v => /^\d{2}-\d{2}-\d{2}$/.test(v),
                message: () => `Sort code is not valid or in the right format (e.g. 22-03-15)`
            }
        },
        account_number: {
            type: String,
            validate: {
                validator: v => /^[0-9]*$/.test(v),
                message: () => `No letters, special characters or spaces allowed for the account number`
            }
        },
        image: { p_id: String, url: String },
        token: String,
        verified: { type: Boolean, default: false },
        discount_code: { type: String, default: "null" },
        password_reset_token: String,
        mail_sub: { type: Boolean, default: true }
    }, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

    schema.virtual("role").get(_ => "ambassador");
    return schema;
})());

module.exports.FAQ = model('FAQ', new Schema({
    question: String,
    answer: String
}));

module.exports.Box = model('Box', new Schema({
    name: { type: String, required: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_sale: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : null },
    info: String,
    max_items: { type: Number, min: 0, required: true },
    image: { p_id: String, url: String },
    products_inc: [String] // array of product IDs
}));

module.exports.Review = model('Review', new Schema({
    headline: String,
    commentry: { type: String, required: true },
    author_name: { type: String, required: true },
    author_verified: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    images: [{ p_id: String, url: String }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Highlights_post = model('Highlights_post', new Schema({
    media_lg: { p_id: String, url: String, media_type: String, orientation: String },
    media_sm: { p_id: String, url: String, media_type: String, orientation: String },
    title: String,
    text_body: String,
    link: String
}));

module.exports.Wishlist = model('Wishlist', new Schema({
    customer_id: { type: String, required: true, index: true, unique: true },
    items: [String] // array of product IDs
}), 'wishlist');

module.exports.Event = model('Event', new Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    ttbc: { type: Boolean, value: false },
    info: String,
    price: { type: Number, required: true, set: n => parseFloat(n) * 100 },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] },
    image: { p_id: String, url: String }
}));

module.exports.Info = model('Info', new Schema({
    main_text: String,
    founder_text: String,
    image: { p_id: String, url: String }
}), 'info');

module.exports.MailTest = model('MailTest', (() => {
    const schema = new Schema({
        last_sent_date: { type: Date, default: new Date(0) },
        email: { type: String, default: process.env.TEST_EMAIL },
        subject: { type: String, default: "Re: test email" },
        message: { type: String, default: "Test email" }
    });

    schema.virtual("newDay").get((val, vt, doc) => doc.last_sent_date.toDateString() != new Date().toDateString());
    return schema;
})(), "mail_test");

module.exports.Subscription_plan = model('Subscription_plan', (() => {
    const schema = new Schema({
        interval: { type: String, enum: ["day", "month", "week", "year"] },
        interval_count: { type: Number, required: true, min: 1 },
        price: { type: Number, set: n => parseFloat(n) * 100 },
        info: { type: String, default: "" }
    });

    schema.virtual("name").get((val, vt, doc) => {
        var interval = doc.interval === "day" ? "Daily" : doc.interval + "ly";
        var interval_count = doc.interval_count > 1 ? doc.interval_count + "-" : "";
        interval = interval.charAt(0).toUpperCase() + interval.slice(1).toLowerCase();
        return interval_count + interval;
    });

    return schema;
})());

module.exports.Subscription_page = model('Subscription_page', Schema({
    info: { type: String, default: "" }
}), 'subscription_page');

module.exports.Subscriber = model('Subscriber', Schema({
    customer: {
        member_id: String,
        name: String,
        email: { type: String, required: true, unique: true }
    },
    sub_id: { type: String, required: true, unique: true }
}));
