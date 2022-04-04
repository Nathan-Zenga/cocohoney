const { Server } = require('socket.io');
const Collections = require('../modules/Collections');

module.exports = server => {
    const io = new Server(server);

    io.on("connection", socket => {
        const url = new URL(socket.handshake.headers.referer);
        url.pathname === "/admin" && Collections(db => {
            const docs = [];
            docs.push(...db.members);
            docs.push(...db.ambassadors);
            docs.push(...db.banner_slides);
            docs.push(...db.discount_codes);
            docs.push(...db.products);
            docs.push(...db.faqs);
            docs.push(...db.shipping_methods);
            docs.push(...db.boxes);
            docs.push(...db.overview_images);
            docs.push(...db.lookbook_media);
            docs.push(...db.highlights_posts);
            docs.push(...db.shipping_page_info);
            docs.push(...db.events);
            docs.push(...db.info);
            socket.emit('admin-search', docs);
        })
    })
}