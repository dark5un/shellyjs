var util = require("util");
var crypto = require("crypto");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");

function ShHash(oid) {
  this._keyType = "kSet";
  this._keyFormat = "set:%s";
  this._data = {};
  this._oid = oid;
  this._key = global.C.DB_SCOPE + util.format(this._keyFormat, oid);
//  this._hash = "";
}

module.exports = ShHash;

ShHash.prototype.key = function () {
  return this._key;
};

ShHash.prototype.getAll = function (cb) {
  var self = this;
  global.db.hgetall(this._key, function (err, data) {
    if (err) {
      cb(1, sh.intMsg("hgetall-null", {key: this._key, error: err, data: data}));
      return;
    }
    if (data === null) {
      return cb(0, {});
    }
    try {
      self._data = data;
      _.each(Object.keys(data), function (key) {
        data[key] = JSON.parse(data[key]);
      });
    } catch (e) {
      return cb(1, sh.intMsg("set-parse", {message: e.message, data: data}));
    }
    return cb(0, self._data);
  });
};

ShHash.prototype.loadOrCreate = function (oid, cb) {
  var self = this;
  this.load(oid, function (error, value) {
    if (error) {
      self.create(oid);
    }
    cb(0, self._data);  // object must be valid
  });
};

ShHash.prototype.save = function (cb) {
  cb(1, sh.intMsg("set-save-not-implemented", "must save elements individually for now"));
};

ShHash.prototype.get = function (field, cb) {
  global.db.hget(this._key, field, function (err, value) {
    if (err) {
      return cb(1, sh.intMsg("hget-error", value));
    }
    if (value === null) {
      return cb(0, null);
    }
    try {
      var data = JSON.parse(value);
      return cb(0, data);
    } catch (e) {
      return cb(1, sh.intMsg("set-parse", {message: e.message, value: value}));
    }
  });
};

ShHash.prototype.set = function (field, value, cb) {
  global.db.hset(this._key, field, JSON.stringify(value), function (err, value) {
    if (err) {
      return cb(1, sh.intMsg("hset-error", value));
    }
    return cb(0, value);
  });
};

ShHash.prototype.remove = function (field, cb) {
  global.db.hdel(this._key, field, function (err, value) {
    if (err) {
      return cb(1, sh.intMsg("hdel-error", value));
    }
    return cb(0, value);
  });
};