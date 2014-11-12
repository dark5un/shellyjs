var path = require("path");
var util = require("util");
var domain = require("domain");
var querystring = require("querystring");

var _ = require("lodash");
var async = require("async");
var uuid = require("node-uuid");
var stackTrace = require("stack-trace");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var stats = require(global.C.BASE_DIR + "/lib/shstats.js");
var session = require(global.C.BASE_DIR + "/lib/shsession.js");  // used by fill session
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var shutil = exports;

shutil.uuid = function () {
  return uuid.v1();
};

shutil.modString = function (str, m) {
  var sum = 0;
  _.each(str, function (c) {
    sum += c.charCodeAt(0);
  });
  return sum % m;
};

shutil.secure = function (obj) {
  var outObj = {};
  _.each(obj, function (value, key) {
    if (key.indexOf("PASS") > -1 || key.indexOf("pass") > -1
        || key.indexOf("PRIVATE") > -1 || key.indexOf("private") > -1) {
      outObj[key] = "**secured**";
    } else {
      if (_.isObject(value) && !_.isArray(value) && !_.isFunction(value)) {
        outObj[key] = shutil.secure(value);
      } else if (_.isFunction(value)) {
        outObj[key] = value.toString();
      } else {
        outObj[key] = value;
      }
    }
  });
  return outObj;
};

function sortObject(o) {
  var sorted = {},
    key, a = [];

  for (key in o) {
    if (o.hasOwnProperty(key)) {
      a.push(key);
    }
  }

  a.sort();

  for (key = 0; key < a.length; key++) {
    sorted[a[key]] = o[a[key]];
  }
  return sorted;
}

shutil.configDoc = function (obj) {
  var sortObj = sortObject(obj);
  _.each(sortObj, function (value, key) {
    console.log("<tr><td>" + key + "</td><td>" + value + "</td><td></td></tr>");
  });
};

shutil.require = function (cmdFile, cb) {
  try {
    if (!global.C.MODULE_CACHE) {
      delete require.cache[require.resolve(cmdFile)];
    }
    var module = require(cmdFile);
    return cb(0, module);
  } catch (e) {
    return cb(1, shutil.intMsg("module-require", {file: cmdFile, message: e.toString()}));
  }
};

shutil.sendWs = function (ws, data) {
  var msg = JSON.stringify(data);
  shlog.debug("send", "socket uid:%s len:%d data:%s", ws.uid, msg.length, msg);
  ws.send(msg);
};

shutil.event = function (event, data) {
  if (_.isUndefined(data) || data === null) {
    data = {};
  }

  var resp = {};
  resp.event = event;
  resp.ts = new Date().getTime();
  resp.data = data;

  return resp;
};

shutil.error = function (code, message, data) {
  var res = this.event("error", data);
  res.code = code;
  res.message = message;

  var trace = stackTrace.get();
  var callerFn = trace[1].getFileName();
  res.file = path.basename(callerFn);
  res.line = trace[1].getLineNumber();

  return res;
};

shutil.errordb = function (data) {
  return shutil.error("db-error", "unable to make db call", data);
};

shutil.intMsg = function (code, data) {
  var res = {};
  res.code = code;
  res.data = data;

  var trace = stackTrace.get();
  var fn = trace[1].getFileName();
  res.file = path.basename(fn);
  res.line = trace[1].getLineNumber();

  return res;
};

shutil.gameUrl = function (gameName, params) {
  return global.C.GAMES_URL + global.games[gameName].url + "?" + querystring.stringify(params);
};

// takes array of uids
shutil.fillProfiles = function (loader, userIds, cb) {
  var profiles = {};
  async.each(userIds, function (userId, lcb) {
    loader.exists("kUser", userId, _w(lcb, function (error, user) {
      if (error || user === null) {
        lcb(); // just skip and keep going
        return;
      }
      profiles[userId] = {};
      profiles[userId].name = user.get("name");
      if (profiles[userId].name.length === 0) {
        profiles[userId].name = "anon" + userId.substr(0, 4);
      }
      lcb();
    }));
  }, function (error) {
    if (error) {
      cb(1, error);
      return;
    }
    cb(0, profiles);
  });
};

// takes object of objects with uids of keys
shutil.extendProfiles = function (loader, profiles, cb) {
  var userIds = Object.keys(profiles);
  async.each(userIds, function (userId, lcb) {
    loader.exists("kUser", userId, _w(lcb, function (error, user) {
      if (error) {
        return lcb(user);
      }
      if (user === null) {  // just keep going
        return lcb();
      }
      profiles[userId].name = user.get("name");
      if (profiles[userId].name.length === 0) {
        profiles[userId].name = "anon" + userId.substr(0, 4);
      }
      lcb();
    }));
  }, function (error) {
    if (error) {
      cb(1, error);
      return;
    }
    cb(0, profiles);
  });
};

shutil.expressCrossDomain = function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Length, X-Requested-With");
  if ("OPTIONS" === req.method) {
    res.sendStatus(200);
    return;
  }
  next();
};