var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;
var mailer = require(global.C.BASE_DIR + "/lib/shmail.js");

var shmailer = exports;

shmailer.sendEmail = function (emailInfo, cb) {

  var baseInfo = {
    timeQueued: 0,
    timeSent: new Date().getTime(),
    retries: 0
  };
  _.assign(baseInfo, emailInfo);
  mailer.send(baseInfo.template, baseInfo, _w(cb, function (err, responseStatus, html, text) {
    if (err) {
      var errorMsg = sh.intMsg(err.code, err.message);
      shlog.error("shmailer", errorMsg);
      return cb(1, errorMsg);
    }
    return cb(0, {error: err, status: responseStatus});
  }));
};

/*global sendLoop */
function sendError(err, data) {
  shlog.error("shmailer", "sendError - sendLoop", err, data);
  setTimeout(sendLoop, 5000);
}

function sendLoop() {
  global.db.spop("jobs:email", _w(sendError, function (err, data) {
    shlog.debug("shmailer", "mailer check:", err, data);
    if (err || !data) {
      // no emails, wait and loop
      setTimeout(sendLoop, 5000);
      return;
    }

    var emailInfo = JSON.parse(data);
    shlog.info("shmailer", "sending:", data);
    shmailer.sendEmail(emailInfo, _w(sendError, function (err, data) {
      if (err) {
        if (emailInfo.retries >= global.C.EMAIL_QUEUE_RETRIES) {
          // do not re-add the email job
          setTimeout(sendLoop, 5000);
          return;
        }
        // add back to set
        emailInfo.retries += 1;
        global.db.sadd("jobs:email", JSON.stringify(emailInfo), function (err, data) {
          setTimeout(sendLoop, 5000);
          return;
        });
        return;
      }
      shlog.info("shmailer", "sent:", err, data);
      sendLoop();
    }));
  }));
}

shmailer.queueEmail = function (emailInfo, cb) {
  emailInfo.timeQueued = new Date().getTime();
  emailInfo.retries = 0;
  global.db.sadd("jobs:email", JSON.stringify(emailInfo), cb);
};


shmailer.send = function (emailInfo, req, res, cb) {
  if (global.C.EMAIL_QUEUE) {
    // queue the email for the consumer worker to process it
    shmailer.queueEmail(emailInfo, _w(cb, function (err, data) {
      if (err) {
        res.add(sh.error("email-queue", "error queueing email", data));
        return cb(err);
      }
      res.add(sh.event(req.body.cmd, {status: "queued", email: emailInfo.email}));
      return cb(0);
    }));
  } else {
    // send the email directly
    shmailer.sendEmail(emailInfo, _w(cb, function (err, data) {
      if (err) {
        res.add(sh.error("email-send", "error sending challenge email", data));
        return cb(err);
      }
      res.add(sh.event(req.body.cmd, {status: "sent", email: emailInfo.email, info: data}));
      return cb(0);
    }));
  }
};

shmailer.queueList = function (cb) {
  global.db.smembers("jobs:email", cb);
};

shmailer.start = function () {
  shlog.system("shmailer", "started");
  process.on("uncaughtException", function (error) {
    shlog.error("shmailer", "uncaughtException", error.stack);
    // restart the loop with delay
    setTimeout(sendLoop, 5000);
  });

  shlog.info("shmailer", "starting mailer");
  sendLoop();
};

shmailer.shutdown = function (cb) {
  shlog.info("shmailer", "shutdown mailer");
  cb(0);
};