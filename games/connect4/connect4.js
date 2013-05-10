var _ = require("lodash");

var shlog = require(global.gBaseDir + "/src/shlog.js");
var sh = require(global.gBaseDir + "/src/shutil.js");

var connect4 = exports;

var COLUMN_FULL = -2;
var EMPTY = -1;
var YELLOW = 0;
var RED = 1;

connect4.create = function (req, res, cb) {
  var board = [];
  for (var i = 0; i < 7; i++) {
    board[i] = []; //init board
    for (var j = 0; j < 6; j++) {
      board[i][j] = EMPTY; //set it to empty
    }
  }

  var state = {};
  state.board = board;
  // first player is always red
  state.reds = req.session.uid;
  state.winner = "";
  state.winnerSet = null;

  req.env.game.set("minPlayers", 2);
  req.env.game.set("maxPlayers", 2);
  req.env.game.set("state", state);


  res.add(sh.event("event.game.create", req.env.game.getData()));
  return cb(0);
};

connect4.reset = function (req, res, cb) {
  var state = req.env.game.get("state");
  for (var i = 0; i < 7; i++) {
    state.board[i] = []; //init board
    for (var j = 0; j < 6; j++) {
      state.board[i][j] = EMPTY; //set it to empty
    }
  }
  console.log('reset the board', state.board);

  res.add(sh.event("event.game.reset", req.env.game.getData()));
  return cb(0);
};

function checkFull(gb) {
  for (var i = 0; i < 7; i++) {
    for (var j = 0; j < 6; j++) {
      if (gb[i][j] === EMPTY) {
        return false;
      }
    }
  }
  return true;
}

function checkVertical(board, turn, column, row) {
  if (row < 3) return false;
  for (var i = row; i > row - 4; i--) {
    if (board[column][i] != turn) return false;
  }
  return true;
}

function checkHorizontal(board, turn, column, row) {
  var counter = 1;
  for (var i = column - 1; i >= 0; i--) {
    if (board[i][row] != turn) break;
    counter++;
  }

  for (var j = column + 1; j < 7; j++) {
    if (board[j][row] != turn) break;
    counter++;
  }
  return counter >= 4;
}

function checkLeftDiagonal(board, turn, column, row) {
  var counter = 1;
  var tmp_row = row - 1;
  var tmp_column = column - 1;

  while (tmp_row >= 0 && tmp_column >= 0) {
    if (board[tmp_column][tmp_row] == turn) {
      counter++;
      tmp_row--;
      tmp_column--;
    } else break;
  }

  row += 1;
  column += 1;

  while (row < 6 && column < 7) {
    if (board[column][row] == turn) {
      counter++;
      row++;
      column++;
    } else {
      break;
    }
  }
  return counter >= 4;
}

function checkRightDiagonal(board, turn, column, row) {
  var counter = 1;
  var tmp_row = row + 1;
  var tmp_column = column - 1;

  while (tmp_row < 6 && tmp_column >= 0) {
    if (board[tmp_column][tmp_row] == turn) {
      counter++;
      tmp_row++;
      tmp_column--;
    } else break;
  }

  row -= 1;
  column += 1;

  while (row >= 0 && column < 7) {
    if (board[column][row] == turn) {
      counter++;
      row--;
      column++;
    } else break;
  }
  return counter >= 4;
}

function checkWin(board, turn, column, row) {
//  var res = {winner: "", set: null};

  if (checkVertical(board, turn, column, row)) return true;
  if (checkHorizontal(board, turn, column, row)) return true;
  if (checkLeftDiagonal(board, turn, column, row)) return true;
  if (checkRightDiagonal(board, turn, column, row)) return true;

  return false;
}

connect4.turn = function (req, res, cb) {
  var uid = req.session.uid;
  var move = req.body.move;
  var game = req.env.game;
  var state = req.env.game.get("state");
  var board = state.board;

  if (board[move.x][move.y] !== EMPTY) {
    res.add(sh.error("move_bad", "this square has been taken"));
    return cb(1);
  }

  var color = YELLOW;
  if (state.reds == uid) {
    color = RED;
  }
  board[move.x][move.y] = color;

  state.lastMove = {uid: uid, move: move, color: color};
//  res.add(sh.event("event.game.turn", state.lastMove));
  global.socket.notify(game.get("oid"), sh.event("event.game.update", state.lastMove));


  var win = checkWin(state.board, color, move.x, move.y);
  if (win) {
    game.set("status", "over");
    game.set("whoTurn", "");
    state.winner = uid;
//    state.winnerSet = win.set;
//    game.set("state", state);
    res.add(sh.event("event.game.over", game.getData()));
    return cb(0);
  }

  if (checkFull(board)) {
    game.set("status", "over");
    game.set("whoTurn", "");
    state.winner = "";
    state.winnerSet = null;
//    game.set("state", state);
    res.add(sh.event("event.game.over", game.getData()));
    return cb(0);
  }

  return cb(0);
}