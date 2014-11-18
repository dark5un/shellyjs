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

var Invite = exports;

Invite.desc = "Invite players to the desired game and start them in it";
Invite.functions = {
  accept: {desc: "accept an invite from a user", params: {chId: {dtype: "string"}}, security: []},
  list: {desc: "list all oustanding invites by the current user", params: {}, security: []},
  email: {desc: "email a challenge", params: {to: {dtype: "string"}, game: {dtype: "string"}}, security: []},
  text: {desc: "text a challenge", params: {phone: {dtype: "string"}, game: {dtype: "string"}}, security: []}
};

/*
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
*/

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
    if (challengeUser.get("email") === "") {
      res.add(sh.error("email-bad", "user does not have valid email", challengeUser));
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

Invite.accept = function (req, res, cb) {
  var fromUid = req.body.fromUid;
  var chParts = req.body.chId.split(":");
  var linkType = chParts[0];
  var linkTo = chParts[1];
  var gameName = chParts[2];

  if (req.session.uid === fromUid) {
    res.add(sh.error("challenge-user", "you cannot accept your own challenge"));
    return cb(1);
  }

  var sendId = linkType + ":" + linkTo + ":" + gameName;
  var sentSet = new ShHash("sent:" + fromUid);
  sentSet.get(sendId, _w(cb, function (err, data) {
    if (err || data === null) {
      res.add(sh.error("challenge-missing", "challenge has already been accepted"), data);
      return cb(err);
    }
    sentSet.remove(sendId, _w(cb, function (err, data) {
      if (linkType === "uid") {
        // remove recvId
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

          // only uid challenges are tracked by counters
          if (linkType === "uid") {
            counter.decr(req.session.uid, "challenges");
          }

          req.body.toUid = fromUid;  // send the notif back to creating user
          sendAccept(req, res, function (err, data) {
            // don't care
          });
          return cb(0);
        }));
      }));
    }));
  }));
};

Invite.list = function (req, res, cb) {
  var test = new ShHash("invites:" + req.session.uid);
  test.getAll(_w(cb, function (err, data) {
    if (err) {
      res.add(sh.error("challenges-getall", "unable to load challenge list", {error: err, data: data}));
      return cb(err);
    }
    res.add(sh.event("challenge.listSent", data));
    return cb(0);
  }));
};

/*
function sendInvite(req, res, cb) {
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
*/

function sendInviteEmail(chData, req, res, cb) {

  var emailInfo = {
    email: chData.linkTo,
    fromProfile: req.session.user.profile(),
    subject: req.session.user.get("name") + " has invited you to play " + chData.game,
    gameName: chData.game,
    challengeUrl: global.C.GAMES_URL + "/accept.html?" + querystring.stringify(
      {"fuid": req.session.uid, "chs": chData.secret, "chId": chData.chId}
    ),
    template: "invite"
  };
  shlog.info("invite", emailInfo);

  mailer.send(emailInfo, req, res, cb);
}


function sendEmail(req, res, cb) {
  if (_.isUndefined(global.games[req.body.game])) {
    res.add(sh.error("game-bad", "unknown game", {game: req.body.game}));
    return cb(1);
  }

  // lookup user and if he has confirmed email link, use the normal challenge.make with linkType = uid

  // check to see if the challenge already exists, just resend so the token doesn't schange

//  var linkType = req.body.type;
  var linkType = "email";
  var linkTo = req.body.to;
  var secret = sh.uuid();

  var sendId = linkType + ":" + linkTo + ":" + req.body.game;
  var sentSet = new ShHash("invites:" + req.session.uid);
  sentSet.get(sendId, _w(cb, function (err, data) {
    if (!err && data) {
//      res.add(sh.error("challenge-alreadymade", "challenge already sent", data));
//      return cb(1);
    }
    var sendData = {
      linkType: linkType,
      linkTo: linkTo,
      fromUid: req.session.uid,
      game: req.body.game,
      secret: secret,
      chId: sendId
    };
    sentSet.set(sendId, sendData, _w(cb, function (err, data) {
      if (err) {
        res.add(sh.error("invite-sentset", "unable to save invite sent", {error: err, data: data}));
        return cb(err);
      }
      if (linkType === "email") {
        return sendInviteEmail(sendData, req, res, cb);
      }
    }));
  }));
}

Invite.email = function (req, res, cb) {
  return sendEmail(req, res, cb);
};

Invite.phone = function (req, res, cb) {
  res.add(sh.event("invite.phone", "not implemented"));
  return cb(0);
};