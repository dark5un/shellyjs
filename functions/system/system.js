var cluster = require("cluster");
var _ = require("lodash");
var shlog = require(global.gBaseDir + "/src/shlog.js");
var sh = require(global.gBaseDir + "/src/shutil.js");
var stats = require(global.gBaseDir + "/src/shstats.js");

var system = exports;

system.desc = "system information, statistics, and setting";
system.functions = {
  stats: {desc: "get all server stats", params: {}, security: ["admin"]},
  statsReset: {desc: "reset all server stats", params: {}, security: ["admin"]},
  stat: {desc: "get a server stat", params: {domain: {dtype: "string"}, key: {dtype: "string"}}, security: ["admin"]},
  statReset: {desc: "reset a server stat", params: {domain: {dtype: "string"}, key: {dtype: "string"}}, security: ["admin"]},
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

system.stat = function (req, res, cb) {
  shlog.debug("system.stat", req.body.domain, req.body.key);

  stats.get(req.body.domain, req.body.key, function (err, data) {
    if (err) {
      res.add(sh.error("stat_get", "unable to get stat", data));
      return cb(0);
    }
    res.add(sh.event("system.stat", {domain: req.body.domain, key: req.body.key, value: data}));
    return cb(0);
  });
};

system.statReset = function (req, res, cb) {
  shlog.debug("system.statGet", req.body.domain, req.body.key);

  stats.reset(req.body.domain, req.body.key, function (err, data) {
    res.add(sh.event("system.statReset", {domain: req.body.domain, key: req.body.key, value: data}));
    return cb(0);
  });
};

system.stats = function (req, res, cb) {
  shlog.debug("system.stats");

  stats.getAll(function (err, stats) {
    if (err) {
      res.add(sh.error("object_get", "unable to get object", stats));
      return cb(0);
    }
    res.add(sh.event("system.stats", stats));
    return cb(0);
  });
};

system.statsReset = function (req, res, cb) {
  shlog.debug("system.statsReset");

  stats.resetAll(function (err, stats) {
    if (err) {
      res.add(sh.error("statsReset", "unable to reset stats", stats));
      return cb(0);
    }
    res.add(sh.event("system.statsReset", stats));
    return cb(0);
  });
};

system.config = function (req, res, cb) {
  shlog.debug("system.config");

  res.add(sh.event("system.config", {gBaseDir: global.gBaseDir, CONFIG: global.C, PACKAGE: global.PACKAGE}));
  return cb(0);
};

system.rawGet = function (req, res, cb) {
  shlog.debug("system.rawGet");

  global.db.get(req.body.key, function (err, data) {
    if (err) {
      res.add(sh.error("object_get", "unable to get object", data));
      return cb(1);
    }
    res.add(sh.event("system.rawGet", {key: req.body.key, value: JSON.parse(data)}));
    return cb(0);
  });
};

system.rawSet = function (req, res, cb) {
  shlog.debug("system.rawSet");

  global.db.set(req.body.key, JSON.stringify(req.body.data), function (err, data) {
    if (err) {
      res.add(sh.error("object_set", "unable to set object", data));
      return cb(1);
    }
    res.add(sh.event("system.rawSet", {key: req.body.key, value: req.body.data}));
    return cb(0);
  });
};