var cluster = require("cluster");
var _ = require("lodash");
var shlog = require(global.gBaseDir + "/src/shlog.js");
var sh = require(global.gBaseDir + "/src/shutil.js");
var stats = require(global.gBaseDir + "/src/shstats.js");

var system = exports;

system.desc = "system information, statistics, and setting";
system.functions = {
  stats: {desc: "get all server stats", params: {}, security: ["admin"]},
  config: {desc: "get all server settings", params: {}, security: ["admin"]},
  rawGet: {desc: "get an object given any key", params: {key: {dtype: "string"}}, security: ["admin"]},
  rawSet: {desc: "set an object given any key", params: {key: {dtype: "string"}, data: {dtype: "object"}}, security: ["admin"]},
  connInfo: {desc: "return info about connection", params: {}, security: []}
};

system.connInfo = function (req, res, cb) {
  shlog.info("system.connInfo");

  var wsid = 0;
  if (_.isObject(res.ws)) {
    wsid = res.ws.id;
  }

  var data = {
    serverId: global.server.serverId,
    wid: cluster.worker.id,
    wsid: wsid
  };

  res.add(sh.event("system.connInfo", data));
  return cb(0);
};

system.stats = function (req, res, cb) {
  shlog.info("system.stats");

  stats.get("stats", "numGets", function(err, stats) {
    res.add(sh.event("system.stats", stats));
    return cb(0);
  });
};

system.config = function (req, res, cb) {
  shlog.info("system.config");

  res.add(sh.event("system.config", {gBaseDir: global.gBaseDir, CONF: global.CONF, PACKAGE: global.PACKAGE}));
  return cb(0);
};

system.rawGet = function (req, res, cb) {
  global.db.get(req.body.key, function (err, data) {
    if (err) {
      res.add(sh.error("object_get", "unable to get object", data));
      return cb(1);
    }
    res.add(sh.event("system.rawGet", JSON.parse(data)));
    return cb(0);
  });
};

system.rawSet = function (req, res, cb) {
  global.db.set(req.body.key, JSON.stringify(req.body.data), function (err, data) {
    if (err) {
      res.add(sh.error("object_set", "unable to set object", data));
      return cb(1);
    }
    res.add(sh.event("system.rawSet", req.body.data));
    return cb(0);
  });
};