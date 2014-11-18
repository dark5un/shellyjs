var fs = require("fs");
var path = require("path");
var async = require("async");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");

exports.desc = "utility functions for shelly apis";
exports.functions = {
  core: {desc: "list all core APIs installed", params: {}, security: []},
  app: {desc: "list all application APIs installed", params: {}, security: []},
  info: {desc: "get info for a single api", params: {name: {dtype: "string"}}, security: []}
};

exports.getInfo = function (fn, cb) {
  shlog.info("api", "getInfo fn=" + fn);

  var m = {};
  m.error = 0;
  m.path = fn;
  m.name = path.basename(fn, ".js");
  m.url = "";
  m.author = "";
  m.desc = "";
  m.functions = {};

  sh.require(fn, function (err, Obj) {
    if (err) {
      m.error = 100;
      m.message = Obj;
      return cb(1, m);
    }
    var api = Obj;
    if (_.isFunction(Obj)) { // handle objects instead of module functions
      api = new Obj();
    }

    if (!_.isUndefined(api.desc)) {
      m.desc = api.desc;
    }
    if (!_.isUndefined(api.url)) {
      m.url = api.url;
    }
    if (!_.isUndefined(api.functions)) {
      m.functions = api.functions;
    }
    if (!global.C.APP_API_DIR) {
      return cb(0, m);
    }
    var appApiFile = global.C.APP_API_DIR + "/" + m.name + "/" + m.name + ".js";
    fs.exists(appApiFile, function (exists) {
      m.override = exists;
      return cb(0, m);
    });
  });
};

exports.info = function (req, res, cb) {
  shlog.info("api", "api.info name=" + req.body.name);
  // SWD centralize this path construction
  var funcDir = global.C.BASE_DIR + "/apis";
  var apiFn = funcDir + "/" + req.body.name + "/" + req.body.name + ".js";
  var m = exports.getInfo(apiFn, function (err, m) {
    // error still returns info object
    res.add(sh.event("api.info", m));
    return cb(0);
  });
};

function apiInfoByDir(dir, cb) {
  var apis = {};
  fs.readdir(dir, function (err, files) {
    if (err) {
      cb(err);
    }
    async.each(files, function (entry, lcb) {
      var fn = dir + "/" + entry;
      fs.stat(fn, function (err, stat) {
        if (stat.isDirectory()) {
          var apiFn = fn + "/" + entry + ".js";
          exports.getInfo(apiFn, function (err, m) {
            apis[m.name] = m;
            return lcb(0);
          });
        } else {
          return lcb(0);
        }
      });
    }, function (error) {
      return cb(0, apis);
    });
  });
}

exports.core = function (req, res, cb) {
  var apiDir = global.C.BASE_DIR + "/apis";

  apiInfoByDir(apiDir, function (err, apis) {
    if (err) {
      res.add(sh.error("api-list-bad", "unable to list core apis", err));
      return cb(1);
    }
    res.add(sh.event("api.core", apis));
    return cb(0);
  });
};

exports.app = function (req, res, cb) {
  if (!global.C.APP_API_DIR) {
    res.add(sh.error("api-dir-missing", "the APP_API_DIR is not set"));
    return cb(1);
  }

  apiInfoByDir(global.C.APP_API_DIR, function (err, apis) {
    if (err) {
      res.add(sh.error("api-list-bad", "unable to list app apis", err));
      return cb(1);
    }
    res.add(sh.event("api.app", apis));
    return cb(0);
  });
};