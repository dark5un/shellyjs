var fs = require("fs");
var _ = require("lodash");
var async = require("async");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var dispatch = require(global.C.BASE_DIR + "/lib/shdispatch.js");
var channel = require(global.C.BASE_DIR + "/apis/channel/channel.js");
var counter = require(global.C.BASE_DIR + "/apis/counter/counter.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

if (_.isUndefined(global.games)) {
  global.games = {};
}

function ShGameBase() {
  this.name = "shgamebase";
  this.config = {enabled : true,
    url : "",
    minPlayers : 2,
    maxPlayers : 2,
    numMatcherProcs: 1
    };
  this.data = {};

  this.desc = "game state and control module";
  this.functions = {
    create: {desc: "create a new game", params: {}, security: []},
    get: {desc: "get game object", params: {gameId: {dtype: "string"}}, security: []},
    join: {desc: "join a game as a new user", params: {gameId: {dtype: "string"}}, security: []},
    enter: {desc: "enter a game where you are already a player", params: {gameId: {dtype: "string"}}, security: []},
    turn: {desc: "calling user taking their turn", params: {gameId: {dtype: "string"}}, security: []},
    reset: {desc: "reset game for another round", params: {gameId: {dtype: "string"}}, security: []},
    leave: {desc: "leave an existing game", params: {gameId: {dtype: "string"}}, security: []},

    configInfo: {desc: "return information about this game", params: {}, security: []},
    playing: {desc: "list all games user is currently playing", params: {}, security: []}
  };
}

module.exports = ShGameBase;

ShGameBase.prototype.initCluster = function (cb) {
  shlog.info("shgamebase", this.name + ".initCluster");

  global.C.CLUSTER["matcher-" + this.name] =
    {src: "/lib/shmatcher.js", num: this.config.numMatcherProcs, args: [this.name]};

  return cb(0);
};

ShGameBase.prototype.register = function () {
  global.games[this.name] = this.config;
}

ShGameBase.prototype.pre = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".pre");
  req.env.game = null;

  // nothing to load
  if (!_.isString(req.body.gameId)) {
    return cb(0);
  }

  // must have a game - load it
  var opts = {lock: true};
  if (req.body.cmd === this.name + ".get" ||
      req.body.cmd === this.name + ".enter") {  // no need to lock the gets or enters
    opts.lock = false;
  }
  shlog.info("shgamebase", this.name + ".pre populating game info for " + req.body.gameId);
  req.loader.exists("kGame", req.body.gameId, _w(cb, function (error, game) {
    if (error) {
      res.add(sh.errordb(game));
      return cb(1);
    }
    if (game === null) {
      if (req.body.cmd === this.name + ".leave") {  // always allow user to remove a bad game
        return cb(0);
      }
      res.add(sh.error("game-load", "unable to load game data", game));
      return cb(1);
    }
    req.env.game = game;

    if (req.body.cmd !== this.name + ".join") {
      if (!_.isObject(game.get("players")[req.session.uid])) {
        res.add(sh.error("game-denied", "you are not a player in this game"));
        return cb(1);
      }
    }
    return cb(0);
  }), opts);
};

ShGameBase.prototype.post = function (req, rs, cb) {
  shlog.info("shgamebase", this.name + ".post");
  return cb(0);
};

ShGameBase.prototype.notify = function (req, res, event) {
  // notify any players in game
  channel.sendInt("game:" + req.env.game.get("oid"), event, req.session.uid);
  // notify me - rest support
  res.add(event);
};

// sends to all game players online - in game channel or not
ShGameBase.prototype.notifyStatus = function (req, res) {
  // notify any players online
  var gameData = req.env.game.getData();
  var event = sh.event(this.name + ".status", {gameId: gameData.oid,
    status: gameData.status,
    gameName: gameData.name,
    gameUrl: sh.gameUrl(gameData.name, {gameId: gameData.oid}),
    whoTurn: gameData.whoTurn,
    name: (gameData.whoTurn === "" ? "no one" : gameData.players[gameData.whoTurn].name),
    pic: ""});

  // increment the turns counter
  if (gameData.whoTurn !== "") {
    counter.incr(gameData.whoTurn, "turns");
  }

  // notify anyone that is onine
  res.notifyAdd(gameData.playerOrder, event, req.session.uid);  // exclude me

  // noitify me - rest support
  res.add(event);
};

function addGamePlaying(loader, uid, game, cb) {
  loader.get("kPlaying", uid, _w(cb, function (error, playing) {
    if (!error) {
      playing.addGame(game);
    }
    cb(error, playing);
  }), {lock: true});
}

function addGamePlayingMulti(loader, players, game, cb) {
  async.each(players, function (playerId, lcb) {
    addGamePlaying(loader, playerId, game, _w(lcb, function (err, data) {
      // ignore any errors
      lcb(0);
    }));
  }, function (error) {
    if (error) {
      cb(1, error);
      return;
    }
    cb(0);
  });
}

ShGameBase.prototype.create = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".create");

  req.loader.create("kGame", sh.uuid(), _w(cb, function (err, game) {
    if (err) {
      res.add(sh.error("game-create", "unable to create a game", game));
      return cb(1);
    }

    game.set("name", req.body.name);
    game.set("ownerId", req.session.uid);
    game.set("whoTurn", req.session.uid);

    // add to request environment
    req.env.game = game;

    if (_.isUndefined(req.body.players)) {
      req.body.players = [req.session.uid];
    }
    // add the players to the game
    _.each(req.body.players, function (playerId) {
      game.setPlayer(playerId, "ready");
    });
    addGamePlayingMulti(req.loader, req.body.players, game, _w(cb, function (error, data) {
      // SWD ignore any errors for now
      if (error) {
        shlog.error("add-players", "unable to add a player", data);
      }
      // copy profile info
      sh.extendProfiles(req.loader, game.get("players"), _w(cb, function (error, data) {
        if (error) {
          res.add(sh.error("user-profiles", "unable to load users for this game", data));
          return cb(1);
        }
        res.add(sh.event(this.name + ".create", req.env.game.getData()));
        return cb(0);
      }));
    }));
  }));
};

ShGameBase.prototype.join = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".join");
  var uid = req.session.uid;
  var game = req.env.game;
  var user = req.session.user;

  var players = game.get("players");
  if (_.isUndefined(players[uid]) && Object.keys(players).length === game.get("maxPlayers")) {
    res.add(sh.error("game-full", "game has maximum amount of players", {maxPlayers: game.get("maxPlayers")}));
    return cb(1);
  }

  // if new to game add to playing list, fill in profile, and notify game channel
  if (!_.isObject(players[uid])) {
    addGamePlaying(req.loader, uid, game, _w(cb, function (error, data) {
      game.setPlayer(uid, "ready");

      channel.sendInt("game:" + game.get("oid"), sh.event(this.name + ".user.join", {gameId: game.get("oid"), uid: uid}));

      // just extend the profile added uid
      sh.extendProfiles(req.loader, game.get("players"), _w(cb, function (error, data) {
        if (error) {
          res.add(sh.error("user-profiles", "unable to load users for this game", data));
          return cb(1);
        }
        res.add(sh.event(this.name + ".join", game.getData()));
        return cb(0);
      }));
    }));
  } else {
    res.add(sh.event(this.name + ".join", game.getData()));
    return cb(0);
  }
};

ShGameBase.prototype.enter = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".enter");
  var game = req.env.game;

  channel.sendInt("game:" + game.get("oid"), sh.event(this.name + ".user.enter", {gameId: game.get("oid"), uid: req.session.uid}));

  res.add(sh.event(this.name + ".enter", game.getData()));
  return cb(0);
};

ShGameBase.prototype.leave = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".leave");
  var uid = req.session.uid;
  var game = req.env.game;

  req.loader.get("kPlaying", uid, _w(cb, function (error, playing) {
    if (error) {
      res.add(sh.error("playing-load", "unable to load playing list", {uid: uid}));
      return cb(1);
    }
    playing.removeGame(req.body.gameId);
    if (req.body.game) {
      channel.sendInt("game:" + game.get("oid"), sh.event(this.name + ".user.leave", {gameId: req.body.gameId, uid: uid}));
    }
    if (game.get("whoTurn") === uid) {
      counter.decr(uid, "turns");
    }
    res.add(sh.event(this.name + ".leave", req.body.gameId));
    return cb(0);
  }), {lock: true});
};

ShGameBase.prototype.turn = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".turn");
  var gameData = req.env.game.getData();

  var minPlayers = this.config.minPlayers;
  if (Object.keys(gameData.players).length < minPlayers) {
    res.add(sh.error("players-missing", "not enough players in game", {required: minPlayers, playerCount: Object.keys(gameData.players).length}));
    return cb(1);
  }
  if (gameData.status === "over") {
    res.add(sh.event(this.name + ".over", gameData));
    return cb(1);
  }
  if (gameData.whoTurn !== req.session.uid) {
    res.add(sh.error("game-noturn", "not your turn", {whoTurn: gameData.whoTurn, gameData: gameData}));
    return cb(1);
  }

  var nextIndex = gameData.playerOrder.indexOf(req.session.uid) + 1;
  if (nextIndex === gameData.playerOrder.length) {
    nextIndex = 0;
  }
  gameData.whoTurn = gameData.playerOrder[nextIndex];
  gameData.turnsPlayed += 1;
  gameData.status = "playing";  // turn looks valid, game module sets "over"

  // update the turn counter
  counter.decr(req.session.uid, "turns");

//  res.add(sh.event(this.name + ".turn", gameData));
//  this.notify(req, res, sh.event(this.name + ".turn", gameData));
  return cb(0);
};

ShGameBase.prototype.get = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".get");
  var game = req.env.game;

  res.add(sh.event(this.name + ".get", game.getData()));
  return cb(0);
};

ShGameBase.prototype.reset = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".reset");
  var gameData = req.env.game.getData();

  gameData.rounds += 1;
  gameData.turns = 0;
  if (gameData.status === "over") {
    gameData.whoTurn = req.session.uid;
  }
  gameData.status = "playing";

  return cb(0);
};

ShGameBase.prototype.configInfo = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".configInfo");

  res.add(sh.event(this.name + ".configInfo", global.games[this.name]));
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

ShGameBase.prototype.playing = function (req, res, cb) {
  shlog.info("shgamebase", this.name + ".playing");

  var uid = req.session.uid;

  var self = this;
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

      res.add(sh.event(self.name + ".playing", data));
      return cb(0);
    }));
  }));
};