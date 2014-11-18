var os = require("os");
var fs = require("fs");
var path = require("path");
var cluster = require("cluster");
var _ = require("lodash");

var shelly = exports;

// number of times SIGINT or SIGQUIT called
var gKillCount = 0;
global.shutdown = false;

global.C = {};
global.C.BASE_DIR = path.dirname(__dirname);

var shlog = null;
var sh = null;
var shCluster = null;
var gWorkerModule = null;

global.CDEF = function (name, value) {
  if (_.isUndefined(global.C[name])) {
    global.C[name] = value;
  }
};

global.CFDEF = function (name, value) {
  global.C[name] = value;
};

// used to pass config to each worker in "shelly.start" message
var gConfig = {};

function initConfig(config) {
  gConfig = config;

  // set any configs passed into constructor
  _.assign(global.C, config);

  // set any configs passed in on command line, force set with CFDEF so they take priority
  var i = 0;
  for (i = 2; i < process.argv.length; i += 1) {
    var argParts = process.argv[i].split("=");
    if (argParts.length === 2) {
      if (argParts[0].indexOf("DIR") !== -1) {
        argParts[1] = path.resolve(argParts[1]);
      }
      global.CFDEF(argParts[0], argParts[1]);
    }
  }

  global.CDEF("CONFIG_DIR", global.C.BASE_DIR + "/config");

  // load configs with private keys
  /*jslint stupid: true */
  var keyConfigFn = global.C.CONFIG_DIR + "/keys.js";
  if (fs.existsSync(keyConfigFn)) {
    require(keyConfigFn);
  }
  // load configs with per machine overrides
  var machineConfigFn = global.C.CONFIG_DIR + "/" + os.hostname() + ".js";
  /*jslint stupid: true */
  if (fs.existsSync(machineConfigFn)) {
    require(machineConfigFn);
  }
  // load the main config
  require(global.C.CONFIG_DIR + "/main.js");

  // load the package info
  global.PACKAGE = require(global.C.BASE_DIR + "/package.json");
}

/*jslint stupid: true */
// OK as this is only called once during startup
function serverInfo() {
  var serverInfoFn = global.C.SERVER_TAG_FN;
  var serverData = {};
  if (fs.existsSync(serverInfoFn)) {
    serverData = require(serverInfoFn);
  } else {
    serverData.serverId = sh.uuid();
    fs.writeFileSync(serverInfoFn, JSON.stringify(serverData));
  }
  return serverData;
}

// master received message from worker
function onWorkerMessage(msg) {
  shlog.debug("shelly", "master recv: %j", msg);

  if (msg.toWid === "all") {
    // forward to all workers, except sender
    _.each(cluster.workers, function (worker, wid) {
      if (parseInt(wid, 10) !== msg.wid) {
        worker.process.send(msg);
      }
    });
  } else {
    // forward just to workerId
    cluster.workers[msg.toWid].send(msg);
  }
}

if (cluster.isMaster) {
  cluster.setupMaster({
    exec : global.C.BASE_DIR + "/src/shelly.js"
  });
}

shelly.start = function (config, cb) {
  cb = cb || function () {};
  initConfig(config);

  // all configs loaded - ok to load sh* modules
  require(global.C.BASE_DIR + "/lib/shcb.js").leanStacks(true);
  shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
  shlog.init(global.C.LOG_MODULES, global.C.LOG_HOOK);
  sh = require(global.C.BASE_DIR + "/lib/shutil.js");
  shCluster = require(global.C.BASE_DIR + "/lib/shcluster.js");

  //  used in cluster bus to forward commands in process.on - message
  global.socket = require(global.C.BASE_DIR + "/src/socket.js");

  // server info for cluster
  global.server = serverInfo();

  shCluster.init(function (err, data) {
    if (err) {
      shlog.error("shelly", "unable to start shcluster module", err, data);
      return cb(1);
    }

    if (cluster.isMaster) {
      shlog.system("shelly", "loaded:", new Date());
      shlog.system("shelly", "server:", global.server);
      shlog.system("shelly", "configBase:", global.C.CONFIG_DIR);
      shlog.info("shelly", "config:", sh.secure(global.C));
      _.each(global.C.CLUSTER, function (info, name) {
        var i = 0;
        for (i = 0; i < info.num; i += 1) {
          var p = cluster.fork({WTYPE: name, SRC: info.src, ARGS: JSON.stringify(info.args)});
          p.on("message", onWorkerMessage);
        }
      });
    } else {
      process.title = "shelly - " + process.env.WTYPE;
      var workerInfo = global.C.CLUSTER[process.env.WTYPE];
      shlog.info("shelly", "starting:", process.env.WTYPE, process.env.SRC, process.env.ARGS);
      gWorkerModule = require(global.C.BASE_DIR + process.env.SRC);
      gWorkerModule.start.apply(gWorkerModule, JSON.parse(process.env.ARGS));
    }
  });

  return cb(0);
};

shelly.shutdown = function () {
  global.shutdown = true;

  if (cluster.isMaster) {
    shlog.system("shelly", "master SIGINT - graceful shutdown");
    // waits for all client processes to end
    shCluster.masterShutdown();
    return;
  }

  if (gWorkerModule) {
    gWorkerModule.shutdown(function () {
      shlog.info("shelly", "shutdown:", process.env.WTYPE);
      shCluster.shutdown();
    });
  } else {
    shCluster.shutdown();
  }
};

cluster.on("online", function (worker) {
  shlog.debug("shelly", "worker online:", worker.id);
  worker.send({cmd: "shelly.start", config: gConfig});
});

cluster.on("disconnect", function (worker) {
  shlog.debug("shelly", "worker disconnect:", worker.id);
});

cluster.on("exit", function (worker) {
  shlog.debug("shelly", "worker exit:", worker.id);
});

// receive message from master
process.on("message", function (msg) {
  if (shlog) { // not init until start is called for config
    shlog.debug("shelly", "onMessage: %j", msg);
  }

  if (msg.cmd === "shelly.start") {
    shelly.start(msg.config);
    return;
  }
  if (msg.cmd === "user.direct") {
    if (process.env.WTYPE !== "socket" && process.env.WTYPE !== "tcp") {
      shlog.error("shelly", "non-socket got a sendDirect", msg);
      return;
    }
    global.socket.sendDirect(msg.toWsid, msg.data);
    return;
  }
  shlog.error("shelly", "bad_message", "unknown command", msg);
});

// if we got here someone missed a _w call
process.on("uncaughtException", function (error) {
  if (shlog) {
    shlog.error("shelly", "uncaughtException", error.stack);
  } else {
    console.log("shelly", "pre-shlog uncaughtException", error.stack);
  }
  // SWD: should try and unreg this server as it just went down
});

process.on("SIGINT", function () {
  if (gKillCount < 1) {
    gKillCount += 1;
    shelly.shutdown();
  } else {
    process.exit();
  }
});

process.on("SIGQUIT", function () {
  if (gKillCount < 1) {
    gKillCount += 1;
    shelly.shutdown();
  } else {
    process.exit();
  }
});