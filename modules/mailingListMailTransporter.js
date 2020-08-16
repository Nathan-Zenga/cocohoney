const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { OAuth2 } = require("googleapis").google.auth;
const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN, NODE_ENV } = process.env;

/** Class for processing mail transports */
class MailingListMailTransporter {
    #req; #res; #member; #user; #pass; #getTransportOpts;

    /**
     * @param {RouteHandlerParams} routeHandlerParams route handler parameters, containing request and response objects
     * @param {mongoose.Document} member existing mailing list member
     */
    constructor(routeHandlerParams, member) {
        this.#req = routeHandlerParams.req;
        this.#res = routeHandlerParams.res;
        this.#member = member;
        const oauth2Client = new OAuth2( OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, "https://developers.google.com/oauthplayground" );
        oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });

        /**
         * Establishes authentication and passes transport objects to sendMail method
         * @param {function} cb callback
         */
        this.#getTransportOpts = cb => {
            nodemailer.createTestAccount((err, acc) => {
                oauth2Client.getAccessToken().then(response => {
                    cb(null, {
                        service: 'gmail', /* port: 465, secure: true, */
                        auth: {
                            type: "OAuth2",
                            user: "info@thecs.co",
                            clientId: OAUTH_CLIENT_ID,
                            clientSecret: OAUTH_CLIENT_SECRET,
                            refreshToken: OAUTH_REFRESH_TOKEN,
                            accessToken: response.token
                        },
                        tls: { rejectUnauthorized: true }
                    });
                }).catch(err => {
                    if (NODE_ENV === "production") return cb(err.message || err);
                    this.#user = this.#user || acc.user; this.#pass = this.#pass || acc.pass;
                    cb(null, {
                        host: 'smtp.ethereal.email',
                        port: 587,
                        secure: false,
                        auth: { user: this.#user, pass: this.#pass }
                    });
                });
            })
        }    
    };

    /**
     * Starts SMTP process of creating and sending new emails
     * @param {object} mailOpts contents to be applied to compose the email
     * @param {string} mailOpts.subject email subject
     * @param {string} mailOpts.message email message
     * @param {function} cb callback
     */
    sendMail(mailOpts, cb) {
        if (!this.#member) return cb("Recipient not set");
        if (!mailOpts.subject || !mailOpts.message) return cb("Email field(s) missing");
        this.#getTransportOpts((err, transportOpts) => {
            if (err) return cb(err.message || err);
            this.#res.render('templates/mail', { message: mailOpts.message, member: this.#member }, (err, html) => {
                let attachments = [{ path: 'public/img/cs-logo.png', cid: 'logo' }];
                this.#res.locals.socials.forEach((s, i) => attachments.push({ path: `public/img/socials/${s.name}.png`, cid: `social_icon_${i}` }));
                nodemailer.createTransport(transportOpts).sendMail({
                    from: "CS <info@thecs.co>",
                    to: this.#member.email,
                    subject: mailOpts.subject,
                    html,
                    attachments
                }, cb);
            })
        });
    };

    /** @param {mongoose.Document} member existing mailing list member */
    setRecipient(member) { this.#member = member; return this };
};

module.exports = MailingListMailTransporter;
