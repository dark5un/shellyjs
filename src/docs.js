var express = require("express");
var favicon = require('serve-favicon');
var os = require("os");
var fs = require("fs");
var path = require("path");
var url = require("url");
var engines = require("consolidate");
var _ = require("lodash");

global.CDEF = function (name, value) {
  if (_.isUndefined(global.C[name])) {
    global.C[name] = value;
  }
};

global.C = {};

// set any configs passed in on command line, force set with CFDEF
var i = 0;
for (i = 2; i < process.argv.length; i += 1) {
  var argParts = process.argv[i].split("=");
  if (argParts.length === 2) {
    if (argParts[0].indexOf("DIR") !== -1) {
      argParts[1] = path.resolve(argParts[1]);
    }
    global.CDEF(argParts[0], argParts[1]);
  }
}

global.CDEF("BASE_DIR", path.dirname(__dirname));
global.CDEF("DOCS_PORT", 5180);

global.CDEF("LOG_CONSOLE_OPTS", { level: "info", colorize: true, timestamp: false });
global.CDEF("LOG_FILE_OPTS", { level: "info", json: false, timestamp: true, filename: global.C.BASE_DIR + "/logs/shelly.log" });
global.CDEF("LOG_MODULES", { "docs" : {} });
global.CDEF("LOG_HOOK", function (winston) {
  winston.add(winston.transports.Console, global.C.LOG_CONSOLE_OPTS);
//    winston.add(winston.transports.File, global.C.LOG_FILE_OPTS);
});

var shlog = require(global.C.BASE_DIR + "/lib/shlog.js");
shlog.init(global.C.LOG_MODULES, global.C.LOG_HOOK);

var commonStatic = global.C.BASE_DIR + "/www/common";
var docsBase = global.C.BASE_DIR + "/www/docs";
var docsStatic = docsBase + "/static";

shlog.system("docs", "docs port: " + global.C.DOCS_PORT);
shlog.system("docs", "docs directory: " + docsBase);

var app = express();
app.use(favicon(docsStatic + "/images/favicon.ico"));
//app.enable("view cache");  // disable this for dev
app.set("views", docsBase);
app.engine("html", engines.ejs);
app.use("/common", express.static(commonStatic));
app.use("/static", express.static(docsStatic));
app.use("/docs", express.static(docsBase));
app.use(express.cookieParser());

function createEnv(req) {
  var map = {};
  return map;
}

app.get("*.html", function (req, res) {
  shlog.info("docs", "%s %s", req.method, req.url);
  var env = createEnv(req);

  res.render(url.parse(req.url).pathname.substring(1), {Env: env, EnvJson: JSON.stringify(env)});
});

app.get("/", function (req, res) {
  shlog.info("docs", "default handler - default page");
  res.redirect("/index.html");
  return 0;
});

//********** error handling

app.use(function (err, req, res, next) {
  shlog.error("docs", "docs error", err, err.stack);
  var env = createEnv(req);
  env.error = {message: err.message, stack: err.stack};

  res.status(500);
  res.render("error.html", {Env: env, EnvJson: JSON.stringify(env)});

  return 0;
});


//********** server init and handlers

var docsServer = null;
exports.start = function () {
  var docsServer = app.listen(global.C.DOCS_PORT, function () {
    shlog.system("docs", "server listening: %s", global.C.DOCS_PORT);
  });

  docsServer.on("error", function (err) {
    shlog.error("docs", err);
  });
};

exports.shutdown = function (cb) {
  if (docsServer && docsServer.address()) {
    docsServer.close();
  }
  cb();
};

exports.start();