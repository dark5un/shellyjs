var util = require("util");
var _ = require("lodash");

var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var ShGameBase = require(global.C.BASE_DIR + "/lib/shgamebase.js");

var gDefaultBoard = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""]
];

function TicTacToe() {
  ShGameBase.call(this);

  this.desc = "tictactoe game";

  this.name = "tictactoe";
  this.config.url = "/tictactoe/tictactoe.html";

  // must register with global game list after all params set
  ShGameBase.prototype.register.call(this);
}

util.inherits(TicTacToe, ShGameBase);
module.exports = TicTacToe;

TicTacToe.prototype.create = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.create.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".create");
    if (error) {
      return cb(error, data);
    }

    var state = {};
    state.gameBoard = gDefaultBoard.slice(0);
    // first player is always X
    state.xes = req.session.uid;
    state.winner = "";
    state.winnerSet = null;
    state.xes = req.session.uid;
    req.env.game.set("state", state);

    res.add(sh.event(this.name + ".create", req.env.game.getData()));

    return cb(0);
  }));
};

TicTacToe.prototype.reset = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.reset.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".reset");
    if (error) {
      return cb(error, data);
    }

    var state = req.env.game.get("state");
    state.gameBoard = gDefaultBoard.slice(0);
    state.winner = 0;
    state.winnerSet = null;
    state.xes = req.session.uid;

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

TicTacToe.prototype.turn = function (req, res, cb) {
  var self = this;
  ShGameBase.prototype.turn.call(this, req, res, _w(cb, function (error, data) {
    shlog.info("connect4", self.name + ".turn");
    if (error) {
      return cb(error, data);
    }

    var uid = req.session.uid;
    var move = req.body.move;
    var game = req.env.game;
    var state = req.env.game.get("state");
    var gameBoard = state.gameBoard;

    if (gameBoard[move.x][move.y] !== "") {
      res.add(sh.error("move-bad", "this square has been taken"));
      return cb(1);
    }

    if (state.xes === uid) {
      gameBoard[move.x][move.y] = "X";
    } else {
      gameBoard[move.x][move.y] = "O";
    }
    state.lastMove = {uid: uid, move: move, color: gameBoard[move.x][move.y]};

    var win = checkWin(gameBoard);
    if (win.winner !== "") {
      game.set("status", "over");
      state.winner = uid;
      state.winnerSet = win.set;
      game.set("state", state);
    }

    var full = checkFull(gameBoard);
    if (full) {
      game.set("status", "over");
      state.winner = "";
      state.winnerSet = null;
      game.set("state", state);
    }

    res.add(sh.event(self.name + ".turn", req.env.game.getData()));
    ShGameBase.prototype.notify.call(self, req, res, sh.event(self.name + ".turn", req.env.game.getData()));
    ShGameBase.prototype.notifyStatus.call(self, req, res);
    if (win || full) {
      ShGameBase.prototype.notify.call(self, req, res, sh.event(self.name + ".over", req.env.game.getData()));
    }

    return cb(0);
  }));
};