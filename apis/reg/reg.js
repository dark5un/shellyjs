var util = require("util");
var crypto = require("crypto");
var querystring = require("querystring");
var _ = require("lodash");
var check = require("validator").check;
var sanitize = require("validator").sanitize;


var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var session = require(global.C.BASE_DIR + "/lib/shsession.js");
var stats = require(global.C.BASE_DIR + "/lib/shstats.js");
var mailer = require(global.C.BASE_DIR + "/lib/shmailer.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var passwordVersion = 1;

exports.desc = "handles user login and new user registration";
exports.functions = {
  create: {desc: "register a user", params: {email: {dtype: "string"}, password: {dtype: "string"}},
    security: [], noSession: true},
  anonymous: {desc: "register an anonymous user", params: {token: {dtype: "string"}}, security: [], noSession: true},
  login: {desc: "user login", params: {
    email: {dtype: "string"},
    password: {dtype: "string"},
    role: {dtype: "string", optional: true}
  }, security: [], noSession: true},
  upgrade: {desc: "upgrade a user id from anonymous to registered", params: {
    email: {dtype: "string"},
    password: {dtype: "string"}
  }, security: []},
  requestReset: {desc: "start the password reset process", params: {email: {dtype: "string"}}, security: [], noSession: true},
  reset: {desc: "reset the password on this account", params: {uid: {dtype: "string"}, rid: {dtype: "string"},
    password: {dtype: "string"}}, security: [], noSession: true},

  remove: {desc: "testing only - remove a registered user", params: {email: {dtype: "string"}}, security: ["admin"]},
  downgrade: {desc: "testing only - remove email from user object", params: {uid: {dtype: "string"}}, security: ["admin"]}
};

function hashPassword(uid, password) {
  var secStr = util.format("uid=%s;pw=%s;secret=%s", uid, password, global.C.LOGIN_PRIVATE_KEY);
  return passwordVersion + ":" + crypto.createHash("md5").update(secStr).digest("hex");
}

function checkPassword(uid, password, hash) {
  var newHash = hashPassword(uid, password);
  return newHash === hash;
}

function createEmailReg(loader, uid, email, password, cb) {
  loader.create("kEmailMap", email, function (err, em) {
    // SWD handle error
    em.set("email", email);
    em.set("uid", uid);
    em.set("password", hashPassword(uid, password));
    return cb(0, em);
  });
}

// used to create the default admin user
exports.verifyUser = function (loader, email, password, cb) {
  loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (error) {
      createEmailReg(loader, sh.uuid(), email, password, function (error, em) {
        if (error) {
          return cb(1, sh.intMsg("emailmap-failed"));
        }
        loader.get("kUser", em.get("uid"), _w(cb, function (error, user) {
          if (error) {
            cb(error, user);
            return;
          }
          // this is a fixup incase something went wrong - no need to lock
          if (user.get("email").length === 0) {
            user.set("email", email);
            user.set("name", email.split("@")[0]);
            user.set("roles", ["admin"]);
          }
          return cb(0, user);
        }));
      });
    } else {
      return cb(0, sh.intMsg("user-exists"));
    }
  }));
};

exports.findUserByEmail = function (loader, email, cb) {
  loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (error) {
      cb(1, sh.intMsg("find-failed", email));
      return;
    }
    loader.exists("kUser", em.get("uid"), _w(cb, function (error, user) {
      if (error) {
        cb(1, sh.intMsg("user-get-failed", {email: email, uid: em.get("uid")}));
        return;
      }
      cb(0, user);
    }));
  }));
};

exports.findUserByToken = function (loader, token, cb) {
  loader.exists("kTokenMap", token, _w(cb, function (error, tm) {
    if (error) {
      cb(1, sh.error("token-bad", "unable to find user with token = " + token, {token: token}));
      return;
    }
    loader.exists("kUser", tm.get("uid"), _w(cb, function (error, user) {
      if (error) {
        cb(1, sh.error("user-bad", "unable to load user for id", {token: token, uid: tm.get("uid")}));
        return;
      }
      cb(0, user);
    }));
  }));
};

exports.login = function (req, res, cb) {
  var out = {};

  var email = sanitize(req.body.email).trim();
  var password = sanitize(req.body.password).trim();
  shlog.info("reg", "login attempt:", email);
  try {
    if (email !== global.C.DEFAULT_ADMIN_NAME) {
      check(email, 102).isEmail();
    }
  } catch (e) {
    res.add(sh.error("email-bad", "email is not correct format"));
    return cb(1);
  }
  var role = sanitize(req.body.role).trim();

  req.loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (error) {
      res.add(sh.error("email-bad", "email is not registered", {email: email}));
      return cb(1);
    }

    // check password
    if (!checkPassword(em.get("uid"), password, em.get("password"))) {
      res.add(sh.error("password-bad", "incorrect password", {email: email}));
      return cb(1);
    }

    req.loader.get("kUser", em.get("uid"), _w(cb, function (error, user) {
      if (error) {
        res.add(sh.error("user-bad", "unable to get user", user));
        return cb(1);
      }
      if (role.length && !_.contains(user.get("roles"), role)) {
        res.add(sh.error("user-role", "user does not have this role: " + role, {role: role, roles: user.get("roles")}));
        return cb(1);
      }

      // push the email into the user object
      if (user.get("email").length === 0) {
        user.set("email", email);
      }

      shlog.info("reg", "login success:", email);
      var out = {};
      out.email = email;
      out.uid = em.get("uid");
      out.session = session.create(em.get("uid"));
      res.add(sh.event("reg.login", out));
      return cb(0);
    }));
  }));
};

exports.anonymous = function (req, res, cb) {

  if (!global.C.REG_ALLOW_ANONYMOUS) {
    res.add(sh.error("reg-denied", "anonymous registration is not allowed"));
    return cb(1);
  }

  var token = sanitize(req.body.token).trim();
  try {
    check(token, "token not long enough").len(6);
  } catch (e) {
    res.add(sh.error("param-bad", "token not valid", {info: e.message}));
    return cb(1);
  }

  req.loader.exists("kTokenMap", token, _w(cb, function (error, tm) {
    if (!error) {
      // check if uid has upgraded account
      req.loader.exists("kUser", tm.get("uid"), _w(cb, function (error, user) {
        if (!error && user.get("email").length) {
          res.add(sh.error("user-upgraded", "user has already upgraded the anonymous account"));
          return cb(1);
        }
        var out = {};
        out.uid = tm.get("uid");
        out.session = session.create(tm.get("uid"));
        res.add(sh.event("reg.anonymous", out));
        return cb(0);
      }));
      return; // stop here
    }

    // not there, so create token map
    req.loader.create("kTokenMap", token, _w(cb, function (err, tm) {
      if (err) {
        res.add(sh.error("tokenmap-create", "unable to create a token to user map"));
        return cb(1);
      }
      tm.set("uid", sh.uuid());
      // user will get created on first login if session is valid
      var out = {};
      out.uid = tm.get("uid");
      out.session = session.create(tm.get("uid"));
      res.add(sh.event("reg.anonymous", out));
      return cb(0);
    }));
  }));
};

exports.upgrade = function (req, res, cb) {
  var email = sanitize(req.body.email).trim();
  var password = sanitize(req.body.password).trim();
  try {
    check(email, "invalid email address").isEmail();
    check(password, "password too short").len(6);
  } catch (e) {
    res.add(sh.error("param-bad", e.message, {info: e.message}));
    return cb(1);
  }

  // make sure the email is not already set
  if (req.session.user.get("email").length > 0) {
    res.add(sh.error("email-set", "email is already set for this user", req.session.user.getData()));
    return cb(1);
  }

  // make sure the email is not in use by someone else
  req.loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (!error) {
      if (em.get("uid") === req.session.user.get("oid")) {
        // set it just in case something went wrong before
        req.session.user.set("email", email);
        res.add(sh.event("reg.upgrade", req.session.user.getData()));
        return cb(0);
      }
      res.add(sh.error("email-inuse", "email is already used by another user"));
      return cb(1);
    }
    // set the email for the user, don't worry about the lock here
    req.session.user.set("email", email);
    req.session.user.set("name", email.split("@")[0]);

    // create the email map
    createEmailReg(req.loader, req.session.uid, email, password, _w(cb, function (error, em) {
      if (error) {
        res.add(sh.error("emailmap-create", "unable to create email map", em));
        return cb(2);
      }
      res.add(sh.event("reg.upgrade", req.session.user.getData()));
      return cb(0);
    }));
  }));
};

// SWD for testing only
exports.downgrade = function (req, res, cb) {
  var uid = req.body.uid;
  req.loader.exists("kUser", uid, _w(cb, function (err, user) {
    if (!err) {
      req.loader.delete("kEmailMap", user.get("email"), _w(cb, function (err, data) {
        if (err) {
          res.add(sh.error("email-delete", "unable to delete email map", data));
          return cb(1);
        }
        user.set("email", "");
        res.add(sh.event("reg.downgrade", {status: "ok"}));
        return cb(0);
      }));
    } else {
      res.add(sh.error("user-bad", "unable to load user", {userId: uid}));
      return cb(1);
    }
  }), {lock: true});
};

exports.create = function (req, res, cb) {
  var email = sanitize(req.body.email).trim();
  var password = sanitize(req.body.password).trim();
  try {
    check(email, "invalid email address").isEmail();
    check(password, "password too short").len(6);
  } catch (e) {
    res.add(sh.error("param-bad", e.message, {info: e.message}));
    return cb(1);
  }

  req.loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (!error) {
      res.add(sh.error("email-used", "this email is already registered", {email: email}));
      return cb(2, em);
    }
    // create the user
    createEmailReg(req.loader, sh.uuid(), email, password, _w(cb, function (error, em) {
      if (error) {
        res.add(sh.error("emailmap-create", "unable to create email map", em));
        return cb(3, em);
      }
      req.loader.get("kUser", em.get("uid"), _w(cb, function (error, user) {
        if (error) {
          res.add(sh.error("user-bad", "unable to load user", user));
          return cb(3);
        }
        user.set("email", email);
        user.set("name", email.split("@")[0]);

        var out = {};
        out.uid = em.get("uid");
        out.session = session.create(em.get("uid"));
        res.add(sh.event("reg.create", out));
        stats.incr("reg", "email-create");
        return cb(0, user);
      }), {lock: true});
    }));
  }));
};

exports.reset = function (req, res, cb) {
  var password = sanitize(req.body.password).trim();
  try {
    check(password, "password too short").len(6);
  } catch (e) {
    res.add(sh.error("param-bad", e.message, {info: e.message}));
    return cb(1);
  }

  req.loader.exists("kUser", req.body.uid, _w(cb, function (error, user) {
    if (error) {
      res.add(sh.error("user-bad", "this user is not valid", {uid: req.body.uid}));
      return cb(1);
    }
    req.loader.exists("kEmailMap", user.get("email"), _w(cb, function (error, em) {
      if (error) {
        res.add(sh.error("email-bad", "this email is not registered", {email: email}));
        return cb(1);
      }
      req.loader.get("kReset", em.get("uid"), _w(cb, function (err, resetInfo) {
        if (err) {
          res.add(sh.error("reset-id-missing", "there is now reset request for this user"));
          return cb(1);
        }
        if (req.body.rid !== resetInfo.get("rid")) {
          res.add(sh.error("reset-id-bad", "the reset id is not valid"));
          return cb(1);
        }
        em.set("password", hashPassword(em.get("uid"), password));

        // cleanup the reset object, so it can't be re-used
        req.loader.delete("kReset", em.get("uid"), _w(cb, function (err, data) {
          var out = {};
          out.session = session.create(em.get("uid"));
          res.add(sh.event("reg.reset", out));
          return cb(0);
        }));
      }));
    }));
  }));
};

exports.requestReset = function (req, res, cb) {
  var email = sanitize(req.body.email).trim();
  try {
    check(email, "invalid email address").isEmail();
  } catch (e) {
    res.add(sh.error("param-bad", e.message, {info: e.message}));
    return cb(1);
  }

  req.loader.exists("kEmailMap", email, _w(cb, function (error, em) {
    if (error) {
      res.add(sh.error("email-bad", "this email is not registered", {email: email}));
      return cb(1);
    }
    req.loader.get("kReset", em.get("uid"), _w(cb, function (err, resetInfo) {
      if (err) {
        res.add(sh.error("reset-object", "unable to create or get the reset object", resetInfo));
        return cb(1);
      }
      if (resetInfo.get("rid").length === 0) {
        resetInfo.set("rid", sh.uuid());
      }
      resetInfo.set("uid", em.get("uid"));

      var emailInfo = {email: req.body.email,
        subject: "password reset for " + req.body.email,
        resetUrl: global.C.REG_RESET_URL + "?" + querystring.stringify(
          {"uid": em.get("uid"), "rid": resetInfo.get("rid")}
        ),
        template: "reset"};
      shlog.info("reg", emailInfo);

      return mailer.send(emailInfo, req, res, cb);
    }));
  }));
};

exports.remove = function (req, res, cb) {
  req.loader.exists("kEmailMap", req.body.email, _w(cb, function (err, em) {
    if (err) {
      res.add(sh.event("reg.remove", {status: "ok", message: "no user exists"}));
      return cb(0);
    }

    req.loader.delete("kEmailMap", req.body.email, _w(cb, function (err, data) {
      if (err) {
        res.add(sh.error("email-delete", "unable to delete email map", em));
        return cb(1);
      }
      req.loader.delete("kUser", em.get("uid"), _w(cb, function (err, data) {
        if (err) {
          res.add(sh.error("user-delete", "unable to delete user", em.get("uid")));
          return cb(1);
        }
        res.add(sh.event("reg.remove", {status: "ok", message: "user and email map removed"}));
        return cb(0);
      }));
    }));
  }));
};