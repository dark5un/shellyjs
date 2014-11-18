var async = require("async");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shlock = require(global.C.BASE_DIR + "/lib/shlock.js");
var shcall = require(global.C.BASE_DIR + "/lib/shcall.js");
var ShLoader = require(global.C.BASE_DIR + "/lib/shloader.js");
var ShRes = require(global.C.BASE_DIR + "/lib/shres.js");
var dispatch = require(global.C.BASE_DIR + "/lib/shdispatch.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var shmatcher = exports;

var gMatchSet = "match:any:";
var gGameName = "";
var gLoader = null;

function matchKey(gameName) {
  return gMatchSet + gameName;
}

shmatcher.match = function (uidList, cb) {
//  return cb(0, {error: err, status: responseStatus});
  return cb(0);
};

/*global matchLoop */
function matchError(err, data) {
  // wait and try again
  shlog.error("matcher-error", err, data);
  setTimeout(matchLoop, global.C.MATCHER_INTERVAL);
}

function addPlayers(playerList, cb) {
  shlog.info("shmatcher", "adding back users", playerList);
  async.eachSeries(playerList,
    function (uid, lcb) {
      global.db.sadd(matchKey(gGameName), uid, function (err, data) {
        // ignore the error as we have to move on
        return lcb(0);
      });
    },
    function (err) {
      return cb(err);
    });
}

function getPlayers(min, max, cb) {
  var playerList = [];
  async.whilst(
    function () { return playerList.length < max; },
    function (lcb) {
      global.db.spop(matchKey(gGameName), _w(lcb, function (err, uid) {
        shlog.info("shmatcher", "pop user", gGameName, uid);
        if (err || uid === null) {
          stopError = true;
          return lcb(1);
        }
        playerList.push(uid);
        return lcb(0);
      }));
    },
    function (err) {
      shlog.info("shmatcher", "matched users", gGameName, playerList);
      if (playerList.length >= min) {
        return cb(0, playerList);
      }
      shlog.error("shmatcher", "not enough users", gGameName, playerList);
      // push back playerList;
      addPlayers(playerList, _w(cb, function (err) {
        return cb(1, sh.intMsg("user-pops-bad", {err: err}));
      }));
    }
  );
}

function tryMatch(cb) {
  var mk = matchKey(gGameName);

  global.db.scard(mk, _w(cb, function (err, count) {
    shlog.debug("shmatcher", mk, count);

    var gameInfo = global.games[gGameName];
    if (err || count < gameInfo.minPlayers) {
      shlog.debug("shmatcher", "not enough users", mk, count);
      return cb(1);
    }

    getPlayers(gameInfo.minPlayers, gameInfo.maxPlayers, _w(cb, function (err, uids) {
      if (err) {
        sh.error("match-error", "unable to match users", uids);
        return cb(2);
      }

      var req = {};
      req.loader = gLoader;
      req.session = {};
      req.session.valid = true;
      req.session.uid = uids[0];
      req.body = {};
      req.body.cmd = gGameName + ".create";     // change the command so we can forward
      req.body.name = gGameName;
      req.body.players = uids;

      var res = new ShRes();
      res.req = req;

      shlog.info("shmatcher", "match made, create game", req.body.players);
      shcall.make(req, res, _w(cb, function (error, data) {
        if (error) {
          shlog.error("shmatcher", error, {data: data, msgs: res.msgs});
          return cb(3);
        }
        gLoader.dump(function (err) {
          var startInfo = {};
          startInfo.gameName = gGameName;
          startInfo.gameId = req.env.game.get("oid");
          startInfo.gameUrl = sh.gameUrl(startInfo.gameName, {"gameId": startInfo.gameId});
          dispatch.sendUsers(req.body.players, sh.event("match.made", startInfo));
          return cb(0);
        });
      }));
    }));
  }));
}

function matchLoop() {
  var mk = matchKey(gGameName);

  shlock.acquire(mk, _w(matchError, function (err, data) {
    if (err) {
      shlog.debug("shmatcher", "no lock", mk);
      setTimeout(function () {matchLoop(); }, global.C.MATCHER_INTERVAL);
      return;
    }
    tryMatch(function (err) {
      shlock.release(mk, _w(matchError, function (err1, data) {
        // ignore err1 from release, as the timeout will pick correct it
        if (err) {
          shlog.debug("shmatcher", "no matches", mk);
          setTimeout(function () {matchLoop(); }, global.C.MATCHER_INTERVAL);
          return;
        }
        matchLoop();  // no errors so try some more now
        return;
      }));
    });
  }));
}

shmatcher.add = function (gameName, uid, cb) {
//  emailInfo.timeQueued = new Date().getTime();
  global.db.sadd(matchKey(gameName), uid, cb);
};

shmatcher.queueList = function (gameName, cb) {
  global.db.smembers(matchKey(gameName), cb);
};

shmatcher.start = function (gameName) {
  shlog.system("shmatcher", "started game =", gameName);

  // can do this as matcher is per process
  gGameName = gameName;
  process.on("uncaughtException", function (error) {
    shlog.error("shmatcher", "uncaughtException", error.stack);
    // restart the loop with delay
    setTimeout(matchLoop, global.C.MATCHER_INTERVAL);
  });

  gLoader = new ShLoader();
  shlog.info("shmatcher", "starting matcher");
  matchLoop();
};

shmatcher.shutdown = function (cb) {
  shlog.info("shmatcher", "shutdown matcher");
  cb(0);
};