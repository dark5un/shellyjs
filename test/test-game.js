var request = require("supertest");
var should = require("should");
var _ = require("lodash");
var st = require("./shtest.js");

/*global describe, before, it*/

var gEmail = "test@lgdales.com";
var gPassword = "foofoo";
var gCurrentGame = "";

describe("module game", function () {

  before(function (done) {
    st.init(gEmail, gPassword, function (err, res) {
      done();
    });
  });

  describe("CMD tictactoe.create", function () {
    it("respond with valid game", function (done) {
      st.userCall({cmd: "tictactoe.create", name: "tictactoe"},
        function (err, res) {
          res.body.should.have.property("event", "tictactoe.create");
          res.body.data.should.have.property("name", "tictactoe");
          res.body.data.should.have.property("oid");
          res.body.data.should.have.property("state");
          gCurrentGame = res.body.data.oid;
          done();
        });
    });
  });
  describe("CMD game.get", function () {
    it("respond with valid game", function (done) {
      st.userCall({cmd: "game.get", gameId: gCurrentGame},
        function (err, res) {
          res.body.should.have.property("event", "game.get");
          res.body.data.should.have.property("name", "tictactoe");
          res.body.data.should.have.property("oid");
          res.body.data.should.have.property("state");
          done();
        });
    });
  });

  describe("CMD tictactoe.reset", function () {
    it("respond with valid game", function (done) {
      st.userCall({cmd: "tictactoe.reset", gameId: gCurrentGame},
        function (err, res) {
          res.body.should.have.property("event", "tictactoe.reset");
          res.body.data.should.have.property("name", "tictactoe");
          res.body.data.should.have.property("oid");
          res.body.data.should.have.property("state");
          done();
        });
    });
  });

  describe("CMD tictactoe.playing", function () {
    it("list games user is playing", function (done) {
      st.userCall({cmd: "tictactoe.playing"},
        function (err, res) {
          res.body.should.have.property("event", "tictactoe.playing");
          done();
        });
    });
  });

  describe("CMD tictactoe.list", function () {
    it("list games available to user", function (done) {
      st.userCall({cmd: "tictactoe.list"},
        function (err, res) {
          res.body.should.have.property("event", "tictactoe.list");
          done();
        });
    });
  });

});