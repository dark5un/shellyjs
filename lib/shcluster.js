var fs = require("fs");
var url = require("url");
var cluster = require("cluster");
var _ = require("lodash");
var async = require("async");
var uuid = require("node-uuid");
var dnode = require("dnode");

var sh = require(__dirname + "/shutil.js");
var shlog = require(__dirname + "/shlog.js");
var _w = require(global.C.BASEDIR + "/lib/shcb.js")._w;
var ShLoader = require(global.C.BASEDIR + "/lib/shloader.js");

var ShCluster = exports;

var shkeys = require(global.C.BASEDIR + "/lib/shkeys.js");
global.db = require(global.C.BASEDIR + "/lib/db/shredis.js");
var gLoader = new ShLoader(global.db);
var gServer = null;

if (_.isUndefined(global.dnodes)) {
  global.dnodes = {};
}

ShCluster.init = function (cb) {
  var self = this;
  shkeys.init(function (err) {
    global.db.init(global.C.DB_OPTIONS, _w(cb, function (err, data) {
      if (err) {
        return cb(err, data);
      }
      // just init the db if we are just worker
      if (cluster.isWorker) {
        return cb(0);
      }
      gLoader.get("kServer", global.server.serverId, _w(cb, function (err, server) {
        server.set("clusterUrl", global.C.CLUSTER_URL);
        server.set("socketUrl", global.C.SOCKET_URL);
        shlog.info("shcluster", "set server info", server.getData());
        gLoader.dump(function (err) {
          global.db.sadd("serverList", global.server.serverId, _w(cb, function (err) {
            if (err) {
              return cb(err, "unable to save to server list");
            }

            // start dnode
            gServer = dnode({
              event : function (msg, cb) {
                shlog.debug("shcluster", "server event recv: %j", msg);
                // cmd = direct.user
                // toWid = workerId
                // toWsid = websocket id of user
                // data = object to forward to user socket
                if (_.isUndefined(msg.cmd)) {
                  shlog.error("shcluster", "server event: bad command %j", msg);
                  return;
                }
                if (_.isUndefined(msg.toWsid)) {
                  shlog.error("shcluster", "server event: socket id %j", msg);
                  return;
                }
                if (_.isUndefined(msg.toWid) || _.isUndefined(cluster.workers[msg.toWid])) {
                  shlog.error("shcluster", "server event: bad worker id %j", msg);
                  return;
                }
                cluster.workers[msg.toWid].send(msg);
                cb("ok");
              }
            });
            var urlParts = url.parse(global.C.CLUSTER_URL);
            shlog.info("shcluster", "starting cluster server on:", urlParts.hostname, urlParts.port);
            gServer.listen(urlParts.port, urlParts.hostName);

            return cb(0, null);
          }));
        });
      }));
    }));
  });
};

ShCluster.shutdown = function () {
  shlog.info("shcluster", "shutdown: cluster dnode clients");
  _.each(global.dnodes, function (obj) {
    shlog.info("shcluster", "shutdown: closing client:", obj.d.serverId);
    obj.d.end();
    delete global.dnodes[obj.d.serverId];
  });

  async.series([
    function (cb) {
      shlog.info("shcluster", "shutdown: dumping loader");
      gLoader.dump(cb);
    },
    function (cb) {
      shlog.info("shcluster", "shutdown: db");
      global.db.close(cb);
    }
  ],
    function (err, results) {
      if (cluster.isMaster) {
        shlog.system("shcluster", "master exit");
      } else {
        shlog.info("shcluster", "worker exit");
      }
      process.exit();
    });
};

var loopUntilNoWorkers = function () {
  var workerCount = Object.keys(cluster.workers).length;
  if (workerCount > 0) {
    shlog.info("shcluster", "there are still " + workerCount + " workers...");
    setTimeout(loopUntilNoWorkers, 1000);
  } else {
    shlog.info("shcluster", "all workers gone, shutdown master");
    ShCluster.shutdown();
  }
};

ShCluster.masterShutdown = function () {
  // take server offline right away
  shlog.info("shcluster", "shutdown: cluster socket server");
  if (gServer) {
    gServer.end();
  }

  async.series([
    function (cb) {
      shlog.info("shcluster", "shutdown: delete server from serverList");
      global.db.srem("serverList", global.server.serverId, cb);
    },
    function (cb) {
      shlog.info("shcluster", "shutdown: delete kServer object");
      gLoader.delete("kServer", global.server.serverId, cb);
    }
  ],
    function (err, results) {
      shlog.system("shcluster", "master waiting for " + Object.keys(cluster.workers).length + " workers...");
      setTimeout(loopUntilNoWorkers, 1000);
    });
};

ShCluster.servers = function (cb) {
  var serverList = {};
  global.db.smembers("serverList", _w(cb, function (err, servers) {
    shlog.info("shcluster", "smembers err:", err, "data:", servers);
    if (err) {
      return cb(err, servers);
    }
    async.each(servers,
      function (item, lcb) {
        gLoader.get("kServer", item, _w(lcb, function (err, server) {
          serverList[item] = server.getData();
          lcb(0);
        }), {checkCache: false});
      },
      function (err) {
        if (err) {
          return cb(err, null);
        }
        cb(0, serverList);
      });
  }));
};

ShCluster.setLocate = function (user, socketId, cb) {
  gLoader.get("kLocate", user.get("oid"), _w(cb, function (err, locate) {
    locate.set("oid", user.get("oid"));
    locate.set("name", user.get("name"));
    locate.set("pict", user.get("pict"));
    locate.set("gender", user.get("gender"));
    locate.set("age", user.get("age"));
    locate.set("serverId", global.server.serverId);
    locate.set("workerId", shlog.workerId);
    locate.set("socketId", socketId);
    shlog.debug("shcluster", "locate set", locate.getData());
    locate.save(cb);
  }));
};

ShCluster.removeLocate = function (uid, cb) {
  gLoader.delete("kLocate", uid, cb);
};

ShCluster.locate = function (uid, cb) {
  gLoader.exists("kLocate", uid, _w(cb, function (err, locateInfo) {
    cb(err, locateInfo);
  }), {checkCache: false});
};

ShCluster.sendServer = function (serverId, data, cb) {
  gLoader.exists("kServer", serverId, _w(cb, function (err, server) {
    if (err) {
      shlog.error("shcluster", "serverId-bad", "cannot find cluster id", serverId);
      return cb(1, sh.intMsg("serverId-bad", serverId));
    }
    var urlParts = url.parse(server.get("clusterUrl"));
    if (_.isUndefined(global.dnodes[serverId])) {
      shlog.info("shcluster", "creating client for:", serverId);
      var d = dnode.connect(urlParts.port, urlParts.hostname);
      d.serverId = serverId;
      d.on("error", function (err, data) {
        shlog.info("shcluster", "socket error - removing:", serverId);
        delete global.dnodes[serverId];
      });
      d.on("fail", function (err, data) {
        shlog.info("shcluster", "socket fail - removing:", serverId);
        delete global.dnodes[serverId];
      });
      d.on("end", function (err, data) {
        shlog.info("shcluster", "socket end - removing:", serverId);
        delete global.dnodes[serverId];
      });
      d.on('remote', function (remote, conn) {
        shlog.debug("shcluster", "send(connect):", conn.serverId, urlParts.hostname, urlParts.port, data);
        global.dnodes[conn.serverId] = {d: conn, remote: remote};
        remote.event(data, function (data) {
          shlog.debug("shcluster", "response: %j", data);
          cb(0, data);
        });
      });
    } else {
      shlog.debug("shcluster", "send(cached):", serverId, urlParts.hostname, urlParts.port, data);
      global.dnodes[serverId].remote.event(data, function (data) {
        shlog.debug("shcluster", "response: %j", data);
        cb(0, data);
      });
    }
  }), {checkCache: false});
};

ShCluster.sendServers = function (data, cb) {
  var ret = {};
  var self = this;
  var serverList = [];
  global.db.smembers("serverList", _w(cb, function (err, servers) {
    if (err) {
      return cb(err, servers);
    }
    async.each(servers, _w(cb, function (serverId, lcb) {
      self.sendServer(serverId, data, _w(lcb, function (err, data) {
        if (!err) {
          ret[serverId] = data;
        }
        lcb(0); // ingore any errors
      }));
    }, function (error) {
      // ingore any errors
      cb(0, ret);
    }));
  }));
};

ShCluster.sendUser = function (uid, data, cb) {
  var self = this;
  gLoader.exists("kLocate", uid, _w(cb, function (err, locateInfo) {
    if (err) {
      shlog.error("shcluster", "user_offline", "user is offline", uid);
      return cb(1, sh.intMsg("user-offline", uid));
    }
    self.sendUserWithLocate(locateInfo, cb);
  }), {checkCache: false});
};

ShCluster.sendUserWithLocate = function (locateInfo, data, cb) {
  var msg = {};
  msg.cmd = "user.direct";
  msg.serverId = locateInfo.get("serverId");
  msg.toWid = locateInfo.get("workerId");
  msg.toWsid = locateInfo.get("socketId");
  msg.data = data;
  shlog.debug("shcluster", "send remote:", msg);
  this.sendServer(msg.serverId, msg, cb);
};

ShCluster.home = function (oid, cb) {
  var self = this;
  global.db.smembers("serverList", _w(cb, function (err, servers) {
    shlog.debug("shcluster", "smembers err: %s, data: %j", err, servers);
    if (err) {
      return cb(err, servers);
    }
    var idx = sh.modString(oid, servers.length);
    var serverId = servers[idx];
    gLoader.get("kServer", serverId, _w(cb, function (err, server) {
      if (err) {
        shlog.error("shcluster", "serverId-bad", "cannot find cluster id", serverId);
        return cb(1, sh.intMsg("serverId-bad", serverId));
      }
      shlog.debug("shcluster", "get home server oid: %s, idx: %s", oid, idx);
      shlog.debug("shcluster", "get home server data: %j", server.getData());
      return cb(0, server.getData());
    }), {checkCache: false});
  }));
};