var express = require("express");
var async = require("async");
var _ = require("lodash");

var shlog = require(global.C.BASEDIR + "/lib/shlog.js");
var stats = require(global.C.BASEDIR + "/lib/shstats.js");
var sh = require(global.C.BASEDIR + "/lib/shutil.js");
var shcall = require(global.C.BASEDIR + "/lib/shcall.js");
var ShLoader = require(global.C.BASEDIR + "/lib/shloader.js");
var _w = require(global.C.BASEDIR + "/lib/shcb.js")._w;

var rest = express();

rest.use(sh.expressCrossDomain);
rest.use(express.bodyParser());
rest.use(express.cookieParser());

// res.add - adds event or error to output stream
function add(data) {
  if (_.isUndefined(this.msgs)) {
    this.msgs = [];
  }
  if (this.req.body._pt) {
    data._pt = this.req.body._pt;
  }
  if (data.event === "error") {
    data.inputs = this.req.body;
    stats.incr("errors", "rest");
    shlog.error("socket", "send %j", data);  // log all errors
  }
  this.msgs.push(data);
}

// res.send - sends all events or errors
function sendAll() {
  this.send(this.msgs);
  this.msgs = [];
}

function clear() {
  this.msgs = [];
}

rest.use(function (req, res, next) {
  shlog.info("rest", "session check");

  req.loader = new ShLoader();
  res.add = add;
  res.sendAll = sendAll;
  res.clear = clear;

  shcall.fillSession(req.body.session, req, res, _w(next, function (error, data) {
    // session.valid now used to control access to functions
    return next();
  }));

  return 0;
});

function respond(req, res, next) {
  _.isFunction(next);  // jslint fix - end of line so never gets called;
  shlog.debug("recv", "rest - %j", req.body);

  // handle the multi msgs case
  var msgs = null;
  if (_.isArray(req.body.batch)) {
    msgs = req.body.batch;
  } else {
    msgs = [req.body];
  }

  async.eachSeries(msgs, function (item, cb) {
    req.body = item;
    shcall.make(req, res, _w(next, function (err, data) {
      if (err === 100) { // unknown exception
        res.add(sh.error("call-error", "call failed", data));
      }
      cb(0);
    }));
  }, function (err) {
    // wait on dump to avoid any timing issues in fast test runs
    req.loader.dump(function (err) {
      res.sendAll();
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

  res.status(500);
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