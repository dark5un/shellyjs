var _ = require("lodash");
var async = require("async");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var shmail = exports;

var nodemailer = require("nodemailer");
var transport = require("nodemailer-smtp-transport")
var path = require("path");
var templatesDir = path.resolve(__dirname, "..", "mail");
var emailTemplates = require("email-templates");

var EmailAddressRequiredError = new Error('email address required');

var defaultTransport = null;
if (global.C.EMAIL_TRANSPORT === "SMTP") {
  defaultTransport = nodemailer.createTransport(transport(global.C.EMAIL_TRANSPORT_SERVICE));
}

shmail.send = function (templateName, locals, cb) {
  if (defaultTransport === null) {
    shlog.error("shmail", "email transport not supported:", global.C.EMAIL_TRANSPORT);
    return cb(null, "no-send");
  }

  if (global.C.EMAIL_NOSEND) {
    return cb(null, "no-send");
  }
  if (global.C.EMAIL_SENDTO  && global.C.EMAIL_SENDTO.length > 0) {
    locals.email = global.C.EMAIL_SENDTO;
  }

  // make sure that we have an user email
  if (!locals.email) {
    return cb(EmailAddressRequiredError);
  }
  // make sure that we have a message
  if (!locals.subject) {
    return cb(EmailAddressRequiredError);
  }
  emailTemplates(templatesDir, _w(cb, function (err, template) {
    if (err) {
      //console.log(err);
      return cb(err);
    }
    // Send a single email
    template(templateName, locals, _w(cb, function (err, html, text) {
      if (err) {
        //console.log(err);
        return cb(err);
      }
      // if we are testing don't send out an email instead return
      // success and the html and txt strings for inspection
      if (process.env.NODE_ENV === 'test') {
        return cb(null, '250 2.0.0 OK 1350452502 s5sm19782310obo.10', html, text);
      }
      var transport = defaultTransport;
      transport.sendMail({
        from: global.C.EMAIL_DEFAULT_FROM,
        to: locals.email,
        subject: locals.subject,
        html: html,
//        generateTextFromHTML: true   - removed from 1.0.0 version
        // text: text
      }, _w(cb, function (err, responseStatus) {
        if (err) {
          shlog.error("shmail", "sending:", locals.email, err);
          return cb(err);
        }
        shlog.info("shmail", "sending:", locals.email, responseStatus.message);
        return cb(null, responseStatus.message, html, text);
      }));
    }));
  }));
};