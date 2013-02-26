// all constants up front for requires
var gPort = 5101;
global.gBaseDir = '/Users/scott/git/shelly';

var util = require('util');
var http = require('http');
var restify = require('restify');
var winston = require('winston');

// do first so any of our modules can use
global.db = require(global.gBaseDir + '/src/shdb.js');

var shutil = require(global.gBaseDir + '/src/shutil.js');
var session = require(global.gBaseDir + '/src/session.js');
var shUser = require(global.gBaseDir + '/src/shuser.js');

var admin  = require('../src/admin.js');

global.live  = require('../src/live.js');
global.live.start();
		
var server = restify.createServer({
	name: "shelly",
});
server.use(restify.acceptParser(server.acceptable));
//server.use(restify.authorizationParser());
//server.use(restify.dateParser());
//server.use(restify.queryParser());
//server.use(restify.bodyParser());
/*
server.use(restify.throttle({
  burst: 100,
  rate: 50,
  ip: true, // throttle based on source ip address
  overrides: {
    '127.0.0.1': {
      rate: 0, // unlimited
      burst: 0
    }
  }
}));
*/
server.use(restify.bodyParser());
/*
server.use(
  function crossOrigin(req,res,next){
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    return next();
  }
);
*/
server.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
	return next();
});

server.use(function(req, res, next) {
	console.log('session check');
	var cmd = req.params.cmd;
	if(cmd == 'reg.login' || cmd == 'reg.create' || cmd == 'reg.check')
	{
		return next();
	}
	
	shutil.fillSession(req, res, function(error, data) {
		if(error != 0) {
			res.send(data);
			return 0;
		}
		return next();
	});

});

server.get('/hello', function(req, res, next) {
	res.send("hello");
	return next();
});

server.post('/api', respond);
server.post('/api/:version', respond);

server.listen(gPort, function() {
	console.log('%s listening at %s', server.name, server.url);
});

function errorStr(error, module)
{
	var info = '';
	if(error != 0 && typeof(module.errors) != 'undefined' && typeof(module.errors[error]) != undefined)
	{
		info = module.errors[error];
	}
	return info;
}

function respond(req, res, next) {
	var cmd = req.params.cmd;
	console.log("respond: " + cmd);
	
	shutil.call(cmd, req, res, function(error, data) {
		console.log("back from call: " + req.params.cmd);
		res.send(data);
	});
}