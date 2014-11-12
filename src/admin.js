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
var adminBase = global.C.BASE_DIR + "/www/admin";
var adminStatic = adminBase + "/static";
var adminLogin = adminBase + "/login";

shlog.info("admin", "admin directory: " + adminBase);

// ensure admin user
var reg = require(global.C.BASE_DIR + "/apis/reg/reg.js");
var loader = new ShLoader();
reg.verifyUser(loader, global.C.DEFAULT_ADMIN_NAME, global.C.DEFAULT_ADMIN_PASSWORD, function (error, data) {
  if (error) {
    shlog.error("admin", "unable to load or create default admin", data);
  }
  loader.dump();
});

var app = express();
app.use(favicon(adminStatic + "/images/favicon.ico"));
//app.enable("view cache");  // disable this for dev
app.set("views", adminBase);
app.engine("html", engines.ejs);
app.use("/common", express.static(commonStatic));
app.use("/static", express.static(adminStatic));
app.use("/docs", express.static(global.C.BASE_DIR + "/www/docs"));
app.use(cookieParser());

app.use(function (req, res, next) {
  if (req.path.substring(0, 5) === "/reg/"
      || req.path.substring(0, 8) === "/static/") {
    return next();
  }

  shlog.info("admin", "session check", req.path);

  // SWD: set cmd as fill session looks at it
  req.body = {};
  req.body.cmd = "admin.page";
  if (_.isUndefined(req.cookies.shSession)) {
    shlog.info("admin", "redirect - no session");
    res.redirect("/reg/login.html");
    return 0;
  }
  shlog.info("admin", "found cookie shSession: ", req.cookies.shSession);

  req.loader = new ShLoader();
  shcall.fillSession(req.cookies.shSession, req, res, _w(next, function (error, data) {
    if (error) {
      shlog.info("admin", "redirect - bad session");
      res.redirect("/reg/login.html");
      return 0;
    }
    // double check the role
    if (!_.contains(req.session.user.get("roles"), "admin")) {
      shlog.info("admin", "redirect - user does not have admin role", req.session.user.get("roles"));
      res.redirect("/reg/login.html");
      return 0;
    }
    req.loader.dump(next);
  }));

  return 0;
});

app.get("/reg/*.html", function (req, res) {
  shlog.info("admin", "in reg", req.url);
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
  if (_.isObject(req.session) && _.isObject(req.session.user)) {
    map.user = req.session.user.getData();
  }
  return map;
}

app.get("*.html", function (req, res) {
  shlog.info("admin", "%s %s", req.method, req.url);
  var env = createEnv(req);

  res.render(url.parse(req.url).pathname.substring(1), {Env: env, EnvJson: JSON.stringify(env)});
});

app.get("/", function (req, res) {
  shlog.info("admin", "default handler - default page");
  res.redirect("/index.html");
  return 0;
});

app.use("/reg", express.static(adminLogin));  // catch all for logout.html and script.js

//********** error handling

app.use(function (err, req, res, next) {
  shlog.error("admin", "admin error", err, err.stack);
  var env = createEnv(req);
  env.error = {message: err.message, stack: err.stack};

  res.status(500);
  res.render("error.html", {Env: env, EnvJson: JSON.stringify(env)});

  return 0;
});


//********** server init and handlers

var adminServer = null;
exports.start = function () {
  var adminServer = app.listen(global.C.ADMIN_PORT, function () {
    shlog.system("admin", "server listening: %s", global.C.ADMIN_URL);
  });

  adminServer.on("error", function (err) {
    shlog.error("admin", err);
  });
};

exports.shutdown = function (cb) {
  if (adminServer && adminServer.address()) {
    adminServer.close();
  }
  cb();
};