var querystring = require("querystring");
var async = require("async");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shcall = require(global.C.BASE_DIR + "/lib/shcall.js");
var session = require(global.C.BASE_DIR + "/lib/shsession.js");
var dispatch = require(global.C.BASE_DIR + "/lib/shdispatch.js");
var counter = require(global.C.BASE_DIR + "/apis/counter/counter.js");
var mailer = require(global.C.BASE_DIR + "/lib/shmailer.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var ShHash = require(global.C.BASE_DIR + "/lib/shhash.js");

var Challenge = exports;

Challenge.desc = "Challenge players to the desired game and start them in it";
Challenge.functions = {
  make: {desc: "challenge a user to a game", params: {toUid: {dtype: "string"}, game: {dtype: "string"}}, security: []},
  accept: {desc: "accept a challenge from a user", params: {chId: {dtype: "string"}}, security: []},
  decline: {desc: "decline a challenge from a user", params: {chId: {dtype: "string"}}, security: []},
  withdraw: {desc: "remove a challenge made to a user", params: {chId: {dtype: "string"}}, security: []},
  list: {desc: "list all challenges recieved by the current user", params: {}, security: []},
  listSent: {desc: "list all challenges sent by the current user", params: {}, security: []},
  alist: {desc: "list all challenges for the given user", params: {uid: {dtype: "string"}}, security: ["admin"]},
  email: {desc: "email a challenge", params: {email: {dtype: "string"}, game: {dtype: "string"}}, security: []},
  emailList: {desc: "list the current email queue", params: {}, security: ["admin"]}
};

function chRemove(fromUid, toUid, gameName, cb) {
  var sendId = toUid + ":" + gameName;
  var sentSet = new ShHash("sent:" + fromUid);
  var sentData = {};
  sentSet.remove(sendId, _w(cb, function (err, data) {
    if (err) {
      return cb(err, sh.intMsg("sent-remove", {error: err, data: data}));
    }
    var recvId = fromUid + ":" + gameName;
    var recvSet = new ShHash("recv:" + toUid);
    recvSet.remove(recvId, _w(cb, function (err, data) {
      if (err) {
        return cb(err, sh.intMsg("recv-remove", {error: err, data: data}));
      }
      cb(0);
    }));
  }));
}

Challenge.make = function (req, res, cb) {
  if (_.isUndefined(global.games[req.body.game])) {
    res.add(sh.error("game-bad", "unknown game", {game: req.body.game}));
    return cb(1);
  }
  if (req.body.toUid === req.session.uid) {
    res.add(sh.error("user-bad", "you cannot challenge yourself"));
    return cb(1);
  }

  var sendId = req.body.toUid + ":" + req.body.game;
  var sendData = {toUid: req.body.toUid, game: req.body.game};
  var sentSet = new ShHash("sent:" + req.session.uid);
  sentSet.set(sendId, sendData, _w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenges-sentset", "unable to save challenge sent", {error: err, data: data}));
      return cb(err);
    }
    var recvId = req.session.uid + ":" + req.body.game;
    var recvSet = new ShHash("recv:" + req.body.toUid);
    var recvData = {
      fromUid: req.session.uid,
      game: req.body.game,
      created: new Date().getTime(),
      name: req.session.user.get("name"),
      gender: req.session.user.get("gender"),
      age: req.session.user.get("age"),
      pict: req.session.user.get("pict")
    };
    recvSet.set(recvId, recvData, _w(cb, function (err, data) {
      if (err) {
        res.add(sh.error("challenges-recvset", "unable to save challenge recv", {error: err, data: data}));
        return cb(err);
      }
      res.chRecievedId = recvId;  // used by sendChallenge when called from challenge.email
      dispatch.sendUser(req.body.toUid,
        sh.event("challenge.send", {chId: recvId, challenge: recvData}),
        _w(cb, function (err, data) {
          // don't care
        }));

      // adjust  the challenges counter
      counter.incr(req.body.toUid, "challenges");

      var resData = {};
      resData[sendId] = sendData;
      res.add(sh.event("challenge.make", resData));
      return cb(0);
    }));
  }));
};

function sendAccept(req, res, cb) {
  req.loader.exists("kUser", req.body.toUid, _w(cb, function (err, challengeUser) {
    if (err) {
      res.add(sh.errordb(challengeUser));
      return cb(1);
    }
    if (challengeUser === null) {
      res.add(sh.error("user-bad", "user does not exist", challengeUser));
      return cb(1);
    }
    var emailInfo = {email: challengeUser.get("email"), fromProfile: req.session.user.profile(),
      toProfile: challengeUser.profile(),
      subject: req.session.user.get("name") + " accepted your challenge to play " + req.env.game.get("name"),
      gameName: req.env.game.get("name"),
      playUrl: global.C.GAMES_URL + "/lobby.html?" + querystring.stringify(
        {"s": session.create(challengeUser.get("oid")), "gn": req.env.game.get("name")}
      ),
      gameUrl: sh.gameUrl(req.env.game.get("name"), {"s": session.create(challengeUser.get("oid")), "gameId": req.env.game.get("oid")}),
      template: "accepted"};
    shlog.info("challenge", emailInfo);

    mailer.send(emailInfo, req, res, cb);
  }));
}

Challenge.accept = function (req, res, cb) {
  var chParts = req.body.chId.split(":");
  var fromUid = chParts[0];
  var gameName = chParts[1];
  chRemove(fromUid, req.session.uid, gameName, _w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenge-remove", "unable to remove challenge"), {err: err, data: data});
      return cb(err);
    }
    req.body.cmd = gameName + ".create";     // change the command so we can forward
    req.body.name = gameName;
    req.body.players = [req.session.uid, fromUid];
    shcall.make(req, res, _w(cb, function (error) {
      if (error) {
        return cb(error);
      }
      res.clear();  // ignore the "game.create" responses
      res.add(sh.event("challenge.accept", {chId: req.body.chId}));

      // wait for game to save to avoid race condition
      req.loader.dump(_w(cb, function (err) {
        var startInfo = {};
        startInfo.gameName = req.env.game.get("name");
        startInfo.gameId = req.env.game.get("oid");
        startInfo.gameUrl = sh.gameUrl(startInfo.gameName, {"gameId": startInfo.gameId});
        var event = sh.event("challenge.start", startInfo);
        res.add(event);
        dispatch.sendUsers(req.body.players, event, req.session.uid);

        // adjust the challenges counter
        counter.decr(req.session.uid, "challenges");

        req.body.toUid = fromUid;  // send the notif back to creating user
        sendAccept(req, res, cb);
      }));
    }));
  }));
};

Challenge.decline = function (req, res, cb) {
  var chParts = req.body.chId.split(":");
  var fromUid = chParts[0];
  var gameName = chParts[1];
  chRemove(fromUid, req.session.uid, gameName, _w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenge-remove", "unable to remove challenge"), data);
      return cb(err);
    }

    // adjust the challenges counter
    counter.decr(req.session.uid, "challenges");

    res.add(sh.event("challenge.decline", {chId: req.body.chId}));
    return cb(0);
  }));
};

Challenge.withdraw = function (req, res, cb) {
  var chParts = req.body.chId.split(":");
  var toUid = chParts[0];
  var gameName = chParts[1];
  chRemove(req.session.uid, toUid, gameName, _w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenge-remove", "unable to remove challenge"), data);
      return cb(err);
    }

    // adjust the challenges counter
    counter.decr(toUid, "challenges");

    res.add(sh.event("challenge.withdraw", {chId: req.body.chId}));
    return cb(0);
  }));
};

Challenge.list = function (req, res, cb) {
  var test = new ShHash("recv:" + req.session.uid);
  test.getAll(_w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenges-getall", "unable to load challenge list", {error: err, data: data}));
      return cb(err);
    }

    // reset the challenges counter
    counter.set(req.session.uid, "challenges", Object.keys(data).length);

    res.add(sh.event("challenge.list", data));
    return cb(0);
  }));
};

Challenge.listSent = function (req, res, cb) {
  var test = new ShHash("sent:" + req.session.uid);
  test.getAll(_w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenges-getall", "unable to load challenge list", {error: err, data: data}));
      return cb(err);
    }
    res.add(sh.event("challenge.listSent", data));
    return cb(0);
  }));
};

Challenge.alist = function (req, res, cb) {
  var test = new ShHash("recv:" + req.body.uid);
  test.getAll(_w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenges-getall", "unable to load challenge list", {error: err, data: data}));
      return cb(err);
    }
    res.add(sh.event("challenge.alist", data));
    return cb(0);
  }));
};

function sendChallenge(req, res, cb) {
  if (_.isUndefined(res.chRecievedId)) {
    res.add(sh.error("missing-info", "unknown challenge id for email template"));
    return cb(1);
  }

  req.loader.exists("kUser", req.body.toUid, _w(cb, function (err, challengeUser) {
    if (err) {
      res.add(sh.errordb(challengeUser));
      return cb(1);
    }
    if (challengeUser === null) {
      res.add(sh.error("user-bad", "user does not exist", challengeUser));
      return cb(1);
    }
    var emailInfo = {email: req.body.email, fromProfile: req.session.user.profile(),
      toProfile: challengeUser.profile(),
      subject: req.session.user.get("name") + " has challenged you to " + req.body.game,
      gameName: req.body.game,
      playUrl: global.C.GAMES_URL + "/lobby.html?" + querystring.stringify(
        {"s": session.create(challengeUser.get("oid")), "gn": req.body.game}
      ),
      challengeUrl: global.C.GAMES_URL + "/mygames.html?" + querystring.stringify(
        {"s": session.create(challengeUser.get("oid")), "chId": res.chRecievedId}
      ),
      template: "challenge"};
    shlog.info("challenge", emailInfo);

    mailer.send(emailInfo, req, res, cb);
  }));
}

Challenge.email = function (req, res, cb) {
  // get uid from email name - creates one if not there
  req.body.cmd = "reg.create";
  req.body.password = "XXXXXX";
  req.body.toUid = null;
  req.body.autoConfirm = true;
  shcall.make(req, res, _w(cb, function (error, data) {
    res.msgs = []; // SWD clear the reg.create event - dont' want it  - should also switch this to res.clear
    if (error && error !== 2) {
      return cb(error);
    }
    if (error === 2) {
      shlog.info("challenge", "user already created", data.get("uid"));
      // existing email map object
      req.body.toUid = data.get("uid");
      res.clear();
    } else {
      // user object
      req.body.toUid = data.get("oid");
    }
    req.body.cmd = "challenge.make";
    shcall.make(req, res, _w(cb, function (error, data) {
      if (error) {
        return cb(error);
      }
      req.body.cmd = "challenge.email";  // flip back for sendEmail response
      sendChallenge(req, res, cb);
    }));
  }));
};

// SWD this should probably be moved to the system or a new email module
Challenge.emailList = function (req, res, cb) {
  mailer.queueList(_w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("emaillist-get", "error getting job queue", data));
      return cb(err);
    }
    res.add(sh.event("challenge.emailList", data));
    return cb(0);
  }));
};