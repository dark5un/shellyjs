var _ = require("lodash");

var shstatsredis = exports;

function makeKey(domain, key) {
  return domain + ":" + key;
}

shstatsredis.reg = function (domain, key) {
  global.db.sadd("stats", makeKey(domain, key), function (err, data) {
    // ignore;
  });
}

shstatsredis.list = function (cb) {
  global.db.smembers("stats", cb);
}

shstatsredis.set = function (domain, key, amount) {
  if (_.isUndefined(amount)) {
    amount = 1;
  }
  global.db.set(makeKey(domain, key), amount, function (err, data) {
//    console.log(err, data);
  });
};

shstatsredis.incr = function (domain, key, amount) {
  if (_.isUndefined(amount)) {
    amount = 1;
  }
  global.db.incr(makeKey(domain, key), amount, function (err, data) {
//    console.log(err, data);
  });
};

shstatsredis.decr = function (domain, key, amount) {
  if (_.isUndefined(amount)) {
    amount = 1;
  }
  global.db.decr(makeKey(domain, key), amount, function (err, data) {
//    console.log(err, data);
  });
};

shstatsredis.stamp = function (domain, key, ts) {
  if (_.isUndefined(ts)) {
    ts = new Date().getTime();
  }
  global.db.set(makeKey(domain, key), ts, function (err, data) {
//    console.log(err, data);
  });
};

shstatsredis.get = function (domain, key, cb) {
  if (!_.isString(domain) || !_.isString(key)) {
    return cb(1, {code: "bad_params", message: "domain or key need to be strings"});
  }
  global.db.get(makeKey(domain, key), cb);
};