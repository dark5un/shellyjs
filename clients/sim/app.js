var request = require("superagent");
var _ = require("lodash");
var async = require("async");

var st = require("/Users/scott/git/shellyjs/test/shtest.js");

var host = "http://localhost:5101";

console.log("go");

var reqTpl1 = {session: "", uid: "", gameId: ""};
var reqTpl2 = {session: "", uid: "", gameId: ""};

var gMoveDelay = 500;

var gRuns = 10;
var gMoveSet = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2]
];

var gMoves = _.clone(gMoveSet);
var gStats = {"0": 0}; // zero is tie
var gRunCount = 0;

/**
 *
 * @param cb
 */
function reset(cb) {
  var reqData = _.clone(reqTpl1);
  reqData.cmd = "tictactoe.reset";
  request.post(host + "/api")
    .send(reqData)
    .set("Accept", "application/json")
    .end(function (res) {
      if (!res.ok) {
        cb(res.error, res.text);
        return;
      }
      cb();
    });
}

/**
 *
 * @param cb
 */
function join(reqTpl, cb) {
  var reqData = _.clone(reqTpl);
  reqData.cmd = "tictactoe.join";
  request.post(host + "/api")
    .send(reqData)
    .set("Accept", "application/json")
    .end(function (res) {
      if (!res.ok) {
        cb(res.error, res.text);
        return;
      }
      console.log("player join", res.body.data.players);
      cb();
    });
}

/**
 *
 * @param tpl
 * @param x
 * @param y
 * @param cb
 */
function move(tpl, x, y, cb) {
  console.log("move:", x, y);
  var reqData = _.clone(tpl);
  reqData.cmd = "tictactoe.turn";
  reqData.move = {x: x, y: y};
  request.post(host + "/api")
    .send(reqData)
    .set("Accept", "application/json")
    .end(function (res) {
      if (gMoveDelay === 0) {
        cb(res.body);
      } else {
        setTimeout(function () {
          cb(res.body);
        }, gMoveDelay);
      }
    });
}

/**
 *
 * @param tpl
 * @param moves
 * @param cb
 */
function moveUntilEnd(tpl, moves, cb) {
  if (moves.length === 0) {
    console.log("error - no more moves left and game did not end.");
    cb();
  }
  var idx = _.random(moves.length - 1);
  var newMove = moves.splice(idx, 1);
  move(tpl, newMove[0][0], newMove[0][1], function (res) {
    if (res.event === "error" && res.code !== "game_noturn") {
      console.log("error", res);
      cb();
      return;
    }
    if (res.code === "game_noturn") {
      // add move back in because it was not our turn
      moves.push(newMove[0]);
    }
    // if win stop
    if (res.event === "tictactoe.over") {
      gStats[res.data.state.winner] += 1;
      console.log("game over");
      cb();
      return;
    }
    var tpl = (res.data.whoTurn === reqTpl1.uid ? reqTpl1 : reqTpl2);
    moveUntilEnd(tpl, moves, cb);
  });
}

function init(cb) {
  st.call({cmd: "reg.login", email: "scott@lgdales.com", password: "foofoo"},
    function (err, res) {
      if (err) {
        console.log("bad login 1");
        cb(1);
      }
      reqTpl1.session = res.body.data.session;
      reqTpl1.uid = res.body.data.session.split(":")[1];
      gStats[reqTpl1.uid] = 0;
      console.log("login:", res.body.data.email, reqTpl1.uid);
      st.call({cmd: "reg.login", email: "test@lgdales.com", password: "foofoo"},
        function (err, res) {
          if (err) {
            console.log("bad login 2");
            cb(1);
          }
          reqTpl2.session = res.body.data.session;
          reqTpl2.uid = res.body.data.session.split(":")[1];
          gStats[reqTpl2.uid] = 0;
          console.log("login:", res.body.data.email, reqTpl2.uid);
          st.call({cmd: "tictactoe.create", name: "tictactoe", session: reqTpl1.session},
            function (err, res) {
              console.log("game created:", res.body.data.oid);
              reqTpl1.gameId = res.body.data.oid;
              reqTpl2.gameId = res.body.data.oid;
              cb();
            });
        });
    });
}

/**
 *
 */
function run() {
  console.log("------------", gRunCount);
  async.waterfall([
    function (cb) { reset(cb); },
    function (cb) { join(reqTpl1, cb); },
    function (cb) { join(reqTpl2, cb); },
    function (cb) { moveUntilEnd(reqTpl1, gMoves, cb); }
  ], function (err, result) {
    if (err) {
      console.log("error: " + err.toString(), result);
      return;
    }
    gMoves = _.clone(gMoveSet);

    gRunCount += 1;
    if (gRunCount < gRuns) {
      run();
    } else {
      console.log("");
      console.log("stats", gStats);
    }
  });
}

init(function (err) {
  if (err) {
    process.exit();
  }
  run();
});

