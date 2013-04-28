var _ = require("lodash");
var async = require("async");

var shlog = require(global.gBaseDir + "/src/shlog.js");

var moduleMap = {
  kObject : {module: null, file: "/src/shobject.js"},
  kUser : {module: null, file: "/src/shuser.js"},
  kPlaying : {module: null, file: "/src/shplaying.js"},
  kGame : {module: null, file: "/src/shgame.js"},
  kEmailMap : {module: null, file: "/src/do/shemailmap.js"},
  kTokenMap : {module: null, file: "/src/do/shtokenmap.js"}
};

function ShLoader() {
  this._db = global.db;
  this._objects = {};
}

module.exports = ShLoader;

ShLoader.prototype.create = function (keyType, params) {
  if (_.isUndefined(moduleMap[keyType])) {
    shlog.error("bad key passed to create", keyType);
    return null;
  }

  var ShClass = null;
  try {
    ShClass = require(global.gBaseDir + moduleMap[keyType].file);
  } catch (e) {
    shlog.error("unable to load object module", keyType);
    return null;
  }

  shlog.info("create-create: '%s - %s'", keyType, params);
  var obj = new ShClass();
  obj.create(params);  // SWD assumes params is just oid for shobjects
  this._objects[obj._key] = obj;
  shlog.info("create-new: '%s'", obj._key);

  return obj;
};

ShLoader.prototype.exists = function (keyType, params, cb) {
  if (_.isUndefined(moduleMap[keyType])) {
    cb(1, {message: "bad key"});
    return;
  }
  // check cache
  var key = this._db.key(keyType, params);
  if (_.isObject(this._objects[key])) {
    shlog.info("cache hit: '%s'", key);
    cb(0, this._objects[key]);
    return;
  }

  var ShClass = null;
  try {
    ShClass = require(global.gBaseDir + moduleMap[keyType].file);
  } catch (e) {
    cb(1, {message: "unable to lod module", data: moduleMap[keyType]});
    return;
  }

  shlog.info("exists-load: '%s - %s'", keyType, params);
  var self = this;
  var obj = new ShClass();
  obj.load(params, function (err, data) {
    if (!err) {
      self._objects[obj._key] = obj;
      cb(0, obj);
      return;
    }
    cb(err, data);
  });
};

ShLoader.prototype.get = function (keyType, params, cb) {
  if (_.isUndefined(moduleMap[keyType])) {
    cb(1, {message: "bad key"});
    return;
  }
  // check cache
  var key = this._db.key(keyType, params);
  if (_.isObject(this._objects[key])) {
    shlog.info("cache hit: '%s'", key);
    cb(0, this._objects[key]);
    return;
  }

  var ShClass = null;
  try {
    ShClass = require(global.gBaseDir + moduleMap[keyType].file);
  } catch (e) {
    cb(1, {message: "unable to lod module", data: moduleMap[keyType]});
    return;
  }

  shlog.info("get-loadOrCreate: '%s - %s'", keyType, params);
  var self = this;
  var obj = new ShClass();
  obj.loadOrCreate(params, function (err, data) {
    if (!err) {
      self._objects[obj._key] = obj;
      cb(0, obj);
      return;
    }
    cb(err, data);
  });
};

ShLoader.prototype.delete = function (keyType, params, cb) {
  if (_.isUndefined(moduleMap[keyType])) {
    cb(1, {message: "bad key"});
    return;
  }
  var key = this._db.key(keyType, params);
  delete this._objects[key];

  this._db.kdelete(keyType, params, cb);
};

ShLoader.prototype.dump = function (cb) {
  shlog.info("dump start");
  var self = this;
  async.each(Object.keys(this._objects), function (key, cb) {
    shlog.info("dumping: '%s'", key);
    self._objects[key].save(cb);
  }, function (err) {
    shlog.info("dump complete");
    if (_.isFunction(cb)) {
      cb(0);
    }
  });
};