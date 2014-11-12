var express = require("express");
var cookieParser = require('cookie-parser');
var favicon = require('serve-favicon');
var os = require("os");
var fs = require("fs");
var path = require("path");
var url = require("url");
var engines = require("consolidate");
var _ = require("lodash");

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
var sh = require(global.C.BASE_DIR + "/lib/shutil.js");
var shcall = require(global.C.BASE_DIR + "/lib/shcall.js");
var ShLoader = require(global.C.BASE_DIR + "/lib/shloader.js");
var _w = require(global.C.BASE_DIR + "/lib/shcb.js")._w;

var commonStatic = global.C.BASE_DIR + "/www/common";
var gamesBase = global.C.BASE_DIR + "/www/games";
var gamesStatic = gamesBase + "/static";

shlog.info("games", "games directory: " + gamesBase);

var app = express();
app.use(favicon(gamesStatic + "/images/favicon.ico"));
//app.enable("view cache");  // disable this for dev
app.set("views", gamesBase);
app.engine("html", engines.ejs);
app.use("/common", express.static(commonStatic));
app.use("/static", express.static(gamesStatic));
app.use(cookieParser());
app.use(function (req, res, next) {
  if (req.path.substring(0, 5) === "/reg/") {
    return next();
  }

  shlog.info("games", "session check", req.path);
  var s = req.param("s");
  if (_.isString(s)) {
    shlog.info("games", "session passed in as param: s");
    req.cookies.shSession = s;
    res.cookie("shSession", s);
  }
  if (_.isUndefined(req.cookies.shSession)) {
    shlog.info("games", "redirect - no session");
    res.redirect("/reg/login.html");
    return 0;
  }
  shlog.info("games", "found shSession: ", req.cookies.shSession);

  // there is no dump and these page do not modify objects
  req.loader = new ShLoader();
  shcall.fillSession(req.cookies.shSession, req, res, _w(next, function (error, data) {
    if (error) {
      shlog.info("games", "redirect - bad session");
      res.redirect("/reg/login.html");
      return 0;
    }
    req.loader.dump(next);
  }));

  return 0;
});

app.get("/reg/*.html", function (req, res) {
  shlog.info("games", "in reg", req.url);
  var env = {};
  env.version = global.PACKAGE.version;
  env.build = global.PACKAGE.build;
  env.token = req.cookies.shToken;
  env.restUrl = global.C.REST_URL;
  env.socketUrl = global.C.SOCKET_URL;
  env.nextUuid = sh.uuid();
  res.render(url.parse(req.url).pathname.substring(1), {Env: env, EnvJson: JSON.stringify(env)});

  return 0;
});

function createEnv(req) {
  var map = {};
  map.version = global.PACKAGE.version;
  map.build = global.PACKAGE.build;
  map.gamesUrl = global.C.GAMES_URL;
  map.restUrl = global.C.REST_URL;
  map.socketUrl = global.C.SOCKET_URL;
  map.session = req.cookies.shSession;
  map.token = req.cookies.shToken;
  map.games = global.games;
  if (_.isObject(req.session) && _.isObject(req.session.user)) {
    map.user = req.session.user.getData();
  }
  return map;
}

app.get("*.html", function (req, res) {
  shlog.info("games", "%s %s", req.method, req.url);
  var env = createEnv(req);
  res.render(url.parse(req.url).pathname.substring(1), {Env: env, EnvJson: JSON.stringify(env)});
});

app.get("/", function (req, res, next) {
  shlog.info("games", "default handler - goto lobby");
  res.redirect("/reg/login.html");
  return 0;
});

app.use("/", express.static(gamesBase));  // catch all for any example js files

//********** error handling

app.use(function (err, req, res, next) {
  shlog.error("games", "game error", err, err.stack);
  var env = createEnv(req);
  env.error = {message: err.message, stack: err.stack};

  res.status(500);
  res.render("error.html", {Env: env, EnvJson: JSON.stringify(env)});
});


//********** server init and handlers

var gameServer = null;
exports.start = function () {
  gameServer = app.listen(global.C.GAMES_PORT, function () {
    shlog.system("games", "server listening: %s", global.C.GAMES_URL);
  });

  gameServer.on("error", function (err) {
    shlog.error("games", err);
  });
};

exports.shutdown = function (cb) {
  if (gameServer && gameServer.address()) {
    gameServer.close();  // do not wait for close given keep-alives
  }
  cb();
};