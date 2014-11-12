var express = require("express");
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var async = require("async");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var stats = require(global.C.BASE_DIR + "/lib/shstats.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shcall = require(global.C.BASE_DIR + "/lib/shcall.js");
var dispatch = require(global.C.BASE_DIR + "/lib/shdispatch.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var ShLoader = require(global.C.BASE_DIR + "/lib/shloader.js");
var ShRes = require(global.C.BASE_DIR + "/lib/shres.js");

var rest = express();

rest.use(sh.expressCrossDomain);
rest.use(bodyParser.json());
rest.use(cookieParser());

rest.use(function (req, res, next) {
  shlog.info("rest", "session check");

  req.loader = new ShLoader();

  var extRes = new ShRes();
  extRes.req = req;
  _.extend(res, extRes);

  shcall.fillSession(req.body.session, req, res, _w(next, function (error, data) {
    // session.valid now used to control access to functions
    return next();
  }));

  return 0;
});

function respond(req, res, next) {
  _.isFunction(next);  // jslint fix - end of line so never gets called;
  shlog.debug("recv", "rest - %j", req.body);

  req.api = "rest";

  // handle the multi msgs case
  var msgs = null;
  if (_.isArray(req.body.batch)) {
    msgs = req.body.batch;
  } else {
    msgs = [req.body];
  }

  async.eachSeries(msgs, function (item, cb) {
    req.body = item;
    shcall.make(req, res, _w(function (err, data) {next(data); }, function (err, data) {
      if (err === 100) { // unknown exception
        res.add(sh.error("call-error", "call failed", data));
      }
      cb(0);
    }));
  }, function (err) {
    // wait on dump to avoid any timing issues
    req.loader.dump(function (err) {
      try {
        res.flush();
        res.notifyFlush();
      } catch (err1) {
        res.add(sh.error("res-flush", "problem sending responses", { message: err1.message, stack: err1.stack }));
      }
    });
  });
}

rest.post("/api", respond);


//********** error handling

rest.use(function (err, req, res, next) {
  // try and save any data modified and release locks, if we got that far
  if (_.isObject(req.loader)) {
    req.loader.dump();
  }

  shlog.error("rest", "rest error %s %j", err, err.stack);
  res.send(sh.error("rest-error", err.message, { message: err.message, stack: err.stack }));
});


//********** server init and handlers

var restServer = null;
exports.start = function () {
  restServer = rest.listen(global.C.REST_PORT, function () {
    shlog.system("rest", "server listening: %s", global.C.REST_URL);
  });

  restServer.on("error", function (err) {
    shlog.error("rest", err);
  });
};

exports.shutdown = function (cb) {
  if (restServer && restServer.address()) {
    restServer.close();  // do not wait for close given keep-alives
  }
  cb();
};