var fs = require("fs");
var _ = require("lodash");
var async = require("async");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var dispatch = require(global.C.BASE_DIR + "/lib/shdispatch.js");
var channel = require(global.C.BASE_DIR + "/apis/channel/channel.js");
var counter = require(global.C.BASE_DIR + "/apis/counter/counter.js");
var module = require(global.C.BASE_DIR + "/apis/api/api.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var Game = exports;

Game.desc = "untility functions for ShGameBase games and multi-game web UI";
Game.functions = {
  list: {desc: "list all loaded games", params: {}, security: []},
  playing: {desc: "list all games user is currently playing", params: {}, security: []}
};

Game.list = function (req, res, cb) {
  shlog.info("game", "game.list");

  res.add(sh.event("game.list", global.games));
  return cb(0);
};

/////////////// Playing functions

function fillGames(loader, gameList, cb) {
  var gameIds = Object.keys(gameList);
  async.each(gameIds, function (gameId, lcb) {
    loader.get("kGame", gameId, _w(lcb, function (err, game) {
      if (err) {
        return lcb(game);
      }
      gameList[gameId].gameName = game.get("name");
      gameList[gameId].status = game.get("status");
      gameList[gameId].whoTurn = game.get("whoTurn");
      gameList[gameId].players = game.get("players");
      gameList[gameId].gameUrl = sh.gameUrl(game.get("name"), {"gameId": game.get("oid")});
      lcb();
/* SWD expensive call with cache turned off
      shcluster.home(gameId, function (err, server) {
        if (err) {
          return lcb(err);
        }
        gameList[gameId].SOCKET_URL = server.SOCKET_URL;
        lcb();
      });
 */
    }));
  }, function (error) {
    if (error) {
      cb(1, error);
      return;
    }
    cb(0, gameList);
  });
}

Game.playing = function (req, res, cb) {
  var uid = req.session.uid;

  req.loader.get("kPlaying", uid, _w(cb, function (error, playing) {
    if (error) {
      res.add(sh.error("playing-load", "unable to load playing list", {uid: uid}));
      return cb(1);
    }
    fillGames(req.loader, playing.getData().currentGames, _w(cb, function (error, data) {
      if (error) {
        res.add(sh.error("playing-fillgames", "unable to fill games in playing list", data));
        return cb(1);
      }

      // take the chance to reset the turn counters
      var turnCount = 0;
      _.each(data, function (obj, key) {
        if (obj.whoTurn === uid) {
          turnCount += 1;
        }
      });
      counter.set(uid, "turns", turnCount);

      res.add(sh.event("game.playing", data));
      return cb(0);
    }));
  }));
};