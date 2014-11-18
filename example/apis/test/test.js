var util = require("util");
var _ = require("lodash");

var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var ShGameBase = require(global.C.BASE_DIR + "/lib/shgamebase.js");

function Test() {
  ShGameBase.call(this);

  this.desc = "test game";

  this.name = "test";
  this.config.url = "/test/test.html";

  // must register with global game list after all params set
  ShGameBase.prototype.register.call(this);
}

util.inherits(Test, ShGameBase);
module.exports = Test;

Test.prototype.create = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.create.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".create");
    if (error) {
      return cb(error, data);
    }

    req.env.game.set("state", {number: _.random(10), winner: false});

    res.add(sh.event(this.name + ".create", req.env.game.getData()));

    return cb(0);
  }));
};

Test.prototype.reset = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.reset.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".reset");
    if (error) {
      return cb(error, data);
    }

    req.env.game.set("state", {number: _.random(10), winner: false});

    res.add(sh.event("game.reset", req.env.game.getData()));
    ShGameBase.prototype.notify.call(self, req, res, sh.event(self.name + ".reset", req.env.game.getData()));
    ShGameBase.prototype.notifyStatus.call(self, req, res);

    return cb(0);
  }));
};

function checkFull(gb) {
  var res = true;
  var i, j;
  for (i = 0; i < 3; i += 1) {
    for (j = 0; j < 3; j += 1) {
      if (gb[i][j] === "") {
        return false;
      }
    }
  }
  return res;
}

function checkWin(gb) {
  var res = {winner: "", set: null};

  var i;
  for (i = 0; i < 3; i += 1) {
    if (gb[i][0] === gb[i][1] && gb[i][0] === gb[i][2]) {
      if (gb[i][0] !== "") {
        res.winner = gb[i][0];
        res.set = ["x" + i + "y0", "x" + i + "y1", "x" + i + "y2"];
        return res;
      }
    }
    if (gb[0][i] === gb[1][i] && gb[0][i] === gb[2][i]) {
      if (gb[0][i] !== "") {
        res.winner = gb[0][i];
        res.set = ["x0y" + i, "x1y" + i, "x2y" + i];
        return res;
      }
    }
  }

  if (gb[0][0] === gb[1][1] && gb[0][0] === gb[2][2]) {
    if (gb[1][1] !== "") {
      res.winner = gb[1][1];
      res.set = ["x0y0", "x1y1", "x2y2"];
      return res;
    }
  }
  if (gb[0][2] === gb[1][1] && gb[0][2] === gb[2][0]) {
    if (gb[1][1] !== "") {
      res.winner = gb[1][1];
      res.set = ["x0y2", "x1y1", "x2y0"];
      return res;
    }
  }
  return res;
}

Test.prototype.turn = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.turn.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".turn");
    if (error) {
      return cb(error, data);
    }

    var state = req.env.game.get("state");
    state.lastId = req.session.uid;
    state.guess = req.body.guess;

    state.winner = parseInt(req.body.guess, 10) === state.number;
    if (state.winner) {
      req.env.game.set("status", "over");
    }


    // don't send back number
    var data = {lastId: req.session.uid, winner: state.winner, guess: req.body.guess};

    res.add(sh.event(self.name + ".turn", data));
    ShGameBase.prototype.notify.call(self, req, res, sh.event(self.name + ".turn", data));
    ShGameBase.prototype.notifyStatus.call(self, req, res);
    if (state.winner) {
      ShGameBase.prototype.notify.call(self, req, res, sh.event(self.name + ".over", req.env.game.getData()));
    }

    return cb(0);
  }));
};