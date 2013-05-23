//var turn = 0, //turn based
var COLUMN_FULL = -2;
var EMPTY = -1;
var YELLOW = 0;
var RED = 1;

var gMyColor = EMPTY;
var gBoard = [];
var gCurrent = null;

function initGame() {
	Crafty.init(600, 500);
	Crafty.canvas.init();

	Crafty.sprite(64, "images/sprite.png", {
		red: [0, 0],
		yellow: [1, 0],
		empty: [2, 0]
	});

  Crafty.scene("game", function() {

    //generate gBoard
    for(var i = 0; i < 7; i++) {
      gBoard[i] = []; //init gBoard
      for(var j = 0; j < 6; j++) {
        Crafty.e("2D, Canvas, empty").attr({x: i * 64, y: j * 64 + 100, z: 2});
        gBoard[i][j] = EMPTY; //set it to empty
      }
    }

    Crafty.c("Circle", {
      Circle: function(radius, color) {
        this.radius = radius;
        this.w = this.h = radius * 2;
        this.color = color || "#000000";

        return this;
      },

      draw: function() {
        var ctx = Crafty.canvas.context;
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(
          this.x + this.radius,
          this.y + this.radius,
          this.radius,
          0,
          Math.PI * 2
        );
        ctx.closePath();
        ctx.fill();
      }
    });

    Crafty.c("piece", {
			init: function() {
				this.z = 3;
        this.requires("Mouse, Gravity, Draggable");
				this.bind("StopDrag", function() {
					var column = Math.round(this._x / 64);
          this.x = column * 64;
					this.gravity("stopper");
          this.unbind("mousedown");

          if (this._y > 80) {
            column = 99;       // drop is too low, set to bad column for reset
          }
					reset(column);
				});
			}
		});

    function reset(column) {
      var row = findEmptyRow(column);
      if(row !== COLUMN_FULL && column >= 0 && column < 7) {
        gBoard[column][row] = gMyColor;
        pieceDrop(gMyColor, column, row);
        gCurrent = null; // stop tracking this piece - it is set
      } else {
        // reset to original position
        gCurrent.destroy();
        gCurrent = null;
        setWhoTurn(Env.user.oid);
      }
    }

		var ground = Crafty.e("2D, stopper").attr({y: Crafty.viewport.height - 16, w: Crafty.viewport.width, h: 20 });
		var bg = Crafty.e("2D, Canvas, Image").image("images/bg.png").attr({z: -1});
	});
};

function win(turn) {
  Crafty.scene("win");
}
function findEmptyRow(column) {
  if(!gBoard[column]) return;
  for(var i = 0; i < gBoard[column].length; i++) {
    if(gBoard[column][i] == EMPTY)
      return i;
  }
  return COLUMN_FULL;
}

/*
 function checkFour(column,row) {
 if(checkVertical(column,row)) return true;
 if(checkHorizontal(column,row)) return true;
 if(checkLeftDiagonal(column,row)) return true;
 if(checkRightDiagonal(column,row)) return true;
 return false;
 }

 function checkVertical(column,row) {
 if(row < 3) return false;
 for(var i = row; i > row-4; i--) {
 if(gBoard[column][i] != turn) return false;
 }
 return true;
 }

 function checkHorizontal(column,row) {
 var counter = 1;
 for(var i = column-1; i >= 0; i--) {
 if(gBoard[i][row] != turn) break;
 counter++;
 }

 for(var j = column+1; j < 7; j++) {
 if(gBoard[j][row] != turn) break;
 counter++;
 }
 return counter>=4;
 }

 function checkLeftDiagonal(column,row) {
 var counter = 1;
 var tmp_row = row-1;
 var tmp_column = column-1;

 while(tmp_row >= 0 && tmp_column >= 0) {
 if(gBoard[tmp_column][tmp_row] == turn) {
 counter++;
 tmp_row--;
 tmp_column--;
 } else break;
 }

 row += 1;
 column += 1;

 while(row < 6 && column < 7) {
 if(gBoard[column][row] == turn) {
 counter++;
 row++;
 column++;
 } else { break; }
 }
 return counter>=4;
 }

 function checkRightDiagonal(column,row) {
 var counter = 1;
 var tmp_row = row+1;
 var tmp_column = column-1;

 while(tmp_row < 6 && tmp_column >= 0) {
 if(gBoard[tmp_column][tmp_row] == turn) {
 counter++;
 tmp_row++;
 tmp_column--;
 } else break;
 }

 row -= 1;
 column += 1;

 while(row >= 0 && column < 7) {
 if(gBoard[column][row] == turn) {
 counter++;
 row--;
 column++;
 } else break;
 }
 return counter>=4;
 }
 */